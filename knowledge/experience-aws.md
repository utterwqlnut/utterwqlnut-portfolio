---
id: experience-aws
title: Amazon Web Services — Software Development Engineering Intern
type: experience
summary: Summer 2026 AWS SDE intern who built an ETL, code-gen, and CDK platform for 300,000+ production alarms, cutting deployments from 13 hours to under 10 minutes across 10+ teams.
tags: [aws, internship, cloudwatch, cdk, etl, code-generation, java, typescript, infrastructure-as-code, deployment]
links:
  resume: /assets/resume.pdf
---

# Amazon Web Services — Software Development Engineering Intern

## TL;DR
From May to August 2026, Dhruva interned as a Software Development Engineer on the AWS Config / Amazon Dedicated Cloud team. Dhruva built an end-to-end platform to migrate, deploy, and manage **more than 300,000 production AWS Config alarms and monitors**. It has three stages:
- **ETL pipeline:** takes a full dump of the existing alarm data and compresses it into a minimal **base-plus-overrides** representation, which is significantly smaller than the configs produced by the previous tooling.
- **Code generator:** writes those configs out as TypeScript.
- **Custom AWS CDK pipeline per team:** packages the generated configs and deploys them, tailored to each team's regions and setup.

The headline result: alarm deployments went from **13-hour legacy cron jobs to under 10 minutes**, adopted across **10+ AWS Config teams**. Each team now deploys independently, with better security, cleaner distribution, and clearer ownership of its alarms.

## Problem & motivation
AWS Config teams run a very large number of production alarms and monitors (CloudWatch alarms). The existing setup deployed them through long-running, centralized legacy cron jobs (13 hours end to end) and stored their definitions as large, repetitive legacy data. That made changes slow, hard to review, and hard to reason about across many teams and regions, and it tied every team to one shared deployment process. Dhruva's platform replaced that with a compact, declarative pipeline for each team.

## Architecture
The system has three components:

```
full dump of legacy alarm data
        │
        ▼
ETL ──► minimal base configs + per-alarm overrides   (much smaller than prior tooling's configs)
        │
        ▼
code-gen ──► TypeScript config files
        │
        ▼
per-team custom AWS CDK pipeline (team's regions, accounts, etc.) ──► packaged + deployed
        │
        ▼
regional CloudWatch alarms owned by each AWS Config team
```

1. **ETL (base + overrides):** ingests a dump of all existing alarm data and factors it into a minimal set of shared **base** definitions plus **overrides** that capture only what differs per alarm. Storing only the deltas significantly reduced config size compared with earlier tools and makes the alarm fleet far easier to review.
2. **Code generation:** turns the base and override configs into TypeScript configuration. The code-gen is "no-op" (idempotent): regenerating unchanged alarms produces no diff, so it can be re-run safely.
3. **Per-team CDK pipelines:** the generated TypeScript is packaged and deployed through a custom AWS CDK pipeline built for each team's particular regions and settings, producing that team's regional CloudWatch alarms.

## Implementation details
- **Languages:** Java and TypeScript; generated configs are TypeScript.
- **Config model:** minimal base definitions plus per-alarm overrides, so shared settings are written once and each alarm records only its differences.
- **Infrastructure as code:** AWS CDK, with a custom pipeline per team configured for that team's regions, deploying CloudWatch alarms.
- **Migration:** the ETL starts from a full dump of the legacy alarm data, so the existing fleet of 300,000+ alarms and monitors moved onto the new platform.
- Internal service names, code, and data are confidential to Amazon, so this document stays at the level above.

## Infrastructure & deployment
- Target: Amazon CloudWatch alarms in multiple AWS regions, owned by 10+ AWS Config teams.
- Deployment mechanism: a generated TypeScript package deployed by a custom CDK pipeline for each team, replacing 13-hour centralized legacy cron jobs.
- Each team deploys independently on its own pipeline, which spreads deployments out and gives each team clear ownership.

## Results & performance
- **300,000+** production alarms and monitors brought onto the platform.
- Deployments cut from **13-hour legacy cron jobs to under 10 minutes** (over a 78× speedup).
- **Significantly smaller configs** than previous tools, thanks to the base-plus-overrides representation.
- Adopted across **10+ AWS Config teams**, each deploying independently.
- **Improved security, distribution, and organization of responsibility**, because each team owns and deploys its own alarms through its own pipeline.

## Testing & evaluation
Results were measured on production workloads: 300,000+ live alarms and monitors across 10+ teams, with deployment time under 10 minutes versus 13 hours for the legacy path. The no-op code-gen also serves as a safety check: regenerating configs for unchanged alarms produces no diff. Details of internal test practices are confidential.

## Tech stack
- Java, TypeScript
- AWS CDK (custom per-team pipelines), Amazon CloudWatch, AWS Config
- ETL pipeline (legacy alarm dump → base + overrides)
- Code generation (configs → TypeScript)

## Design decisions & tradeoffs
- **Base + overrides instead of fully expanded definitions:** shared settings are stored once and each alarm records only what differs. That keeps configs small and makes hundreds of thousands of alarms reviewable and generatable.
- **Generated TypeScript configs:** alarms become typed code that CDK can package and deploy directly.
- **No-op code-gen:** generation is idempotent, so pipelines can run often without causing churn.
- **A CDK pipeline per team instead of centralized cron jobs:** deployments become declarative, fast, and team-independent, with each team's regions handled by its own pipeline. This also improves security and makes ownership of each team's alarms clear.

## Next steps
- Next: onboard additional teams and alarm types onto the same base-plus-overrides and per-team CDK pipeline.
- Internal roadmap details are confidential to Amazon.

## Likely questions (Q&A)
- **What team was Dhruva on at AWS?** AWS Config / Amazon Dedicated Cloud, as a Software Development Engineering intern (May–Aug 2026).
- **What was the biggest impact?** Alarm deployments went from 13-hour legacy cron jobs to under 10 minutes, across 10+ AWS Config teams that now each deploy independently.
- **How many alarms?** Over 300,000 production alarms and monitors.
- **How does the system work?** Three stages. An ETL takes a dump of all alarm data and builds a minimal base-plus-overrides config. A code generator writes that out as TypeScript. A custom AWS CDK pipeline for each team, configured for its regions, packages and deploys it.
- **What does "base and overrides" mean?** Common alarm settings live in shared base definitions, and each alarm stores only the fields that differ. This significantly reduced config size compared with previous tools.
- **Why "no-op" code-gen?** Because it's idempotent: re-running generation on unchanged alarms produces no diff, so pipelines can run frequently and safely.
- **Why a pipeline per team?** It makes teams independent of each other and of one central job. It also improves security and makes ownership of each team's alarms clear, and each pipeline is set up for that team's regions.
- **What tech did Dhruva use?** Java, TypeScript, and AWS CDK, deploying CloudWatch alarms.
- **Can you share the code?** No, it's internal to Amazon, but Dhruva can discuss the architecture and design decisions.

## Sources
- Dhruva's résumé (`/assets/resume.pdf`).
- Dhruva's own description of the system architecture (ETL to base + overrides, TypeScript code-gen, per-team CDK pipelines).
