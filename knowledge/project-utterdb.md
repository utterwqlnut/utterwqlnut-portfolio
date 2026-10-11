---
id: project-utterdb
title: UtterDB — distributed in-memory key-value store in Go
type: project
summary: Sharded, replicated in-memory key-value store in Go that hit 100,000+ req/s at 1 ms p50, with zero-downtime rebalancing and Terraform-provisioned AWS load testing.
tags: [go, distributed-systems, key-value-store, consistent-hashing, grpc, terraform, aws, locust, replication]
links:
  repo: https://github.com/utterwqlnut/utterdb
---

# UtterDB — distributed in-memory key-value store in Go

## TL;DR
UtterDB is a distributed, in-memory key-value store Dhruva designed and built in Go. It sustains **100,000+ requests per second at 1 ms end-to-end p50 latency** and served **over 150 million requests with zero read/write failures** in distributed Locust stress tests on AWS. Clients send pipe-delimited text commands over TCP to stateless proxies, which route each key to storage nodes on a murmur3 consistent-hash ring and replicate writes to `replication_factor` consecutive nodes. A control-plane process called the "manipulator" heartbeats nodes, removes failed ones, streams data between nodes during rebalancing with zero downtime, and pushes new rings to the proxies. The whole cluster, including an AWS Network Load Balancer and Locust load generators, is provisioned with one Terraform-driven deploy script.

## Problem & motivation
The goal: shard data across nodes with consistent hashing, keep replicas, and rebalance live when the cluster scales. Dhruva split the system so storage nodes (data) and proxies (routing) scale horizontally and independently behind one load-balanced endpoint.

## Architecture
```
 Locust workers ──TCP──▶ AWS NLB :9000 ──▶ Proxy i (:8100+i) ──gRPC──▶ Storage node j (:8000+j)
                                               ▲  NEWRING (TCP)              ▲ Health / InitiateMove /
                                               │                             │ ClearOldData (gRPC)
                                          Manipulator (:8080) ───────────────┘
            ADDNODE / REMOVENODE  → proxy forwards to manipulator
```
- **Proxies** (`src/proxy/main.go`) parse client commands and hold their own copy of the hash ring. They call nodes over gRPC.
- **Storage nodes** (`src/node/`) are gRPC servers that hold an in-memory, internally sharded map.
- **Manipulator** (`src/manipulator/main.go`) owns cluster membership. It runs heartbeats, handles `ADDNODE`/`REMOVENODE`, orchestrates data movement, and broadcasts `NEWRING|<ring>` to every proxy.
- **Hash ring** (`src/hashing/hashRing.go`) is shared by proxies and manipulator.

## Implementation details
**Wire protocol (client to proxy).** Commands are newline-terminated and `|`-delimited: `WRITE|key|keyType|value|valueType`, `GET|key|keyType`, `ERASE|key|keyType`, `ADDNODE|ip`, `REMOVENODE|ip`, `GETRAM`, `GETCPU`. Responses are `OK`, the value, or `ERR <msg>`. Supported types are `int`, `float` and `string` (`src/node/server/types.go`). Values are parsed into `Int`/`Float`/`String` structs behind a `Stringable` interface, and those structs are the map keys, so the store is typed end to end.

**gRPC service** (`protos/nodeComm.proto`): `Get`, `Write`, `Erase`, `Health`, `RamUse`, `CpuUse`, `InitiateMove`, `ClearOldData`, and the server-streaming `MoveData(DataStreamReq) returns (stream Data)`.

**Key placement.** Each node gets one position on the ring: `murmur3.Sum64` of its name (`"node_<index>"`). A key's owner is the first node clockwise whose hash is ≥ `murmur3.Sum64(key)`, found with an O(log N) binary search (`sort.Search`). Its replicas are the next `RF-1` nodes on the ring (`nodesForKey`). `effectiveReplication` clamps RF to between 1 and the ring size. `config.yaml` sets `replication_factor: 2`.

**Read/write paths** (`hashRing.go`):
- `Write`/`Erase` send the gRPC call to each replica in ring order with a 1-second timeout, returning on the first error.
- `Get` reads from the primary (`GetNode` = `nodesForKey(key)[0]`), so a read costs a single RPC.
- The result is synchronous write-all replication with fast primary reads.

**Storage node internals** (`src/node/server/internal.go`). The store is `shards` Go maps (128 in `config.yaml`), each guarded by its own `sync.RWMutex`, which keeps lock contention low under concurrent load. A key's shard is `murmur3(key) % shards`. `withinHashRange` checks whether a key hash falls in a ring arc, including arcs that wrap around zero. At startup the node tunes `vm.swappiness` from config (`src/node/main/main.go`).

**Streaming migration with live write forwarding.** For a move, the manipulator calls `InitiateMove{start,end,ip}` on the destination. The destination then calls `MoveData` on the source and writes each streamed record into its local store (`server.go`). The source side of `MoveData`:
1. Sets `migrating = true` and opens a gRPC client back to the destination.
2. For each internal shard, takes a read lock, snapshots the keys in the hash range, and streams them.
3. While `migrating` is true, the source's `Write` and `Erase` handlers also forward each mutation to the destination, so writes made during the copy are never lost. This is the in-memory, WAL-style mechanism behind zero-downtime rebalancing.

**Node join** (`AddNode`):
1. Stream the new node's primary range from a neighbouring node.
2. Stream the `RF-1` replica ranges it now holds (`rebalanceReplicasOnAdd`).
3. Insert the node into the ring under the write lock and re-sort.
4. Call `ClearOldData` on the nodes that no longer own those ranges (`clearStaleReplicasOnAdd`, then the source range).

The manipulator then pushes `NEWRING` to all proxies.

**Node leave/failure** (`RemoveNode`):
1. Stream the departing node's range to its successor.
2. Stream replica ranges to the successor from the surviving holders.
3. Clear stale replicas (starting at `j=2`, so it does not wipe data just moved onto the successor).
4. Splice the node out of the ring.

`RemoveNode` is designed to proceed even when the departing node is dead: data survives through the copies held on other replicas.

**Heartbeating and failover** (`HeartBeat`, `manipulator/main.go`). A `robfig/cron` job calls `Health` on every node every 5 s with a 2 s timeout. Any node with `fails >= 1` is removed through `RemoveNode`, with a 5 s sleep between removals, giving fast failover. A second cron job re-broadcasts the ring to the proxies every 5 s. The broadcast runs one goroutine per proxy, with up to 5 retries 20 ms apart. Because reads go to the primary, a failed primary's keys are next served by its successor, which already held them as a replica when RF ≥ 2.

**Concurrency model.**
- The proxy and manipulator spawn one goroutine per accepted TCP connection.
- In the proxy, a global `RWMutex` guards swapping the ring pointer on `NEWRING`. Data commands take the read lock, so they run in parallel.
- Inside `HashRing`, `globalLock` (an `RWMutex`) lets data operations run alongside each other but blocks them during ring mutation. A separate `rebalanceLock` serializes `AddNode`/`RemoveNode`.
- Nodes rely on gRPC's concurrent handlers plus the per-shard locks. A `migrateLock` guards the migration flag and client.

## Infrastructure & deployment
- **Terraform** (`deploy/terraform/main.tf`) provisions, in the default VPC on Amazon Linux 2023 (region default `us-east-1`):
  - one manipulator EC2 instance
  - `node_count` data nodes and `proxy_count` proxies (default type `t3.micro`)
  - `benchmark_count` Locust instances (default `m7a.xlarge`)
  - an internet-facing AWS NLB with cross-zone load balancing, a TCP listener on 9000, and a target group of proxies with TCP health checks
  - one security group
- **`deploy/deploy.sh`** runs the whole rollout in one command:
  1. Runs `terraform apply`.
  2. Generates `config.yaml` from the instances' private IPs (nodes on 8000+i, proxies on 8100+i, manipulator on 8080, RF 2, 128 shards).
  3. Waits for SSH, then bootstraps every host in parallel (installs Go and git, clones the repo, writes the config).
  4. Starts services in order (nodes, then manipulator, then proxies), each as a systemd unit with `Restart=on-failure` (`deploy/scripts/start_*.sh`).
  5. Launches Locust, either as a single local run or as a distributed master plus workers.
- `src/nlb/nlb.py` validates the config's NLB settings.

## Results & performance
- **100,000+ req/s at 1 ms end-to-end p50 latency.**
- **150 million+ requests with 0 read/write failures** in Locust stress tests.
- **Zero-downtime rebalancing** through copy-then-switch migration with live write forwarding.
- Horizontal scaling of both data (storage nodes) and routing (proxies) behind a single NLB endpoint.
- Example benchmark invocation from the README: `--benchmark-nodes 4 --users 500 --spawn-rate 100 --duration 60s`.

## Testing & evaluation
Dhruva load-tested the full cluster end to end on AWS. `src/test/benchmark.py` is a Locust `User` that speaks raw TCP to the NLB with `TCP_NODELAY` and zero wait time, so it measures the store rather than client think time. Its mix is 70% `GET` on random keys `k0`–`k100000` and 30% `WRITE` of unique `k<time_ns>` keys. It reports per-request latency and failures through Locust's events, and scales out across dedicated `m7a.xlarge` load-generator instances in master/worker mode.

## Tech stack
- Go 1.25 (gRPC, protobuf, `spaolacci/murmur3`, `robfig/cron`, `gopsutil`, `yaml.v3`)
- gRPC / Protocol Buffers
- Terraform (AWS provider ~> 5.0): EC2, Network Load Balancer, security groups
- Bash deploy scripts, systemd
- Python + Locust (distributed master/worker)

## Design decisions & tradeoffs
- **Stateless proxies with a pushed ring.** Proxies learn membership through `NEWRING`, so routing scales by adding proxies behind the NLB. The ring is pushed right after each membership change and every 5 s.
- **Copy, then switch, then clean up.** `AddNode` streams data and starts forwarding writes before it changes the ring, and clears old copies only afterwards. This is the mechanism behind zero-downtime rebalancing.
- **Primary-only reads.** Reads cost one RPC, which keeps p50 latency low. Writes pay for RF sequential RPCs in exchange for synchronous replication.
- **Single-strike failure detection** makes failover fast, trading some sensitivity to slow health checks for quick recovery.
- **Per-shard locking inside each node** (128 shards) keeps concurrent reads and writes from contending on one lock.

## Next steps
- Next: add a persistent write-ahead log so data survives full-cluster restarts.
- Next: replicate the manipulator for a highly available control plane.
- Next: add virtual nodes for smoother load distribution across the ring.
- Next: add quorum reads/writes with versioning and read repair for tunable consistency.
- Next: add a Go unit and integration test suite alongside the Locust load tests.

## Likely questions (Q&A)
- **How fast is it?** 100,000+ req/s at 1 ms end-to-end p50 latency, and 150M+ requests with 0 read/write failures under Locust stress tests.
- **How are keys mapped to nodes?** murmur3 64-bit hash of the key, then a binary search for the first node clockwise on the ring.
- **What's the replication factor?** Configurable; set to 2 in `config.yaml` and in the generated deploy config. Replicas are the next consecutive nodes on the ring.
- **What consistency does it provide?** Writes go synchronously to all replicas, and reads are served by the primary in a single RPC.
- **What happens when a node dies?** The manipulator's 5 s heartbeat detects it, calls `RemoveNode` to re-replicate its ranges onto the successor, and pushes a new ring to the proxies. The successor already holds a replica, so reads keep working.
- **How does rebalancing avoid losing writes?** The source node streams the range over gRPC `MoveData` and forwards every concurrent write and erase to the destination until the stream finishes. Old copies are cleared only after the ring switches.
- **Is data persisted?** It is an in-memory store; durability comes from replication across nodes. A persistent log is a planned next step.
- **How was it benchmarked?** With distributed Locust over raw TCP against the AWS NLB, using a 70/30 GET/WRITE mix, all provisioned by the Terraform deploy script.
- **How is it deployed?** One script (`deploy/deploy.sh`) runs Terraform, generates the cluster config, bootstraps every host in parallel, starts systemd services in order, and launches the load test.

## Sources
- https://github.com/utterwqlnut/utterdb (commit `93b791a`): `README.md`, `config.yaml`, `go.mod`, `protos/`, `src/` (all packages), `deploy/` (script, start scripts, Terraform)
- Dhruva's résumé
