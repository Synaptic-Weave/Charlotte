# Charlotte — AI Virtual Receptionist

## Overview

Charlotte is an AI-powered virtual receptionist built on the Google Agent Development Kit (ADK) and Twilio. She handles inbound and outbound calls, routes them intelligently, takes messages, schedules appointments, and provides business information, all without a human on the line. Charlotte is designed to qualify for the Google Cloud for Startups AI Agents Challenge.

## Architecture

- **Runtime:** Google Agent Development Kit (ADK) (orchestration, multi-agent hierarchies, state management)
- **Voice / Telecom:** Twilio (inbound/outbound calls, WebSockets for real-time media streams, SMS)
- **AI Core:** Google Gemini models integrated natively via Google ADK (`@google/adk` SDK)
- **Stack:** TypeScript + Node.js (highly optimized for Twilio's asynchronous WebSockets voice streaming pipeline)

## Repository

- GitHub: https://github.com/Synaptic-Weave/Charlotte (private)
- Local: ~/Documents/Gemini/projects/Charlotte

## Competitors

- **Vapi.ai** — Voice AI platform. Lower level than Charlotte: they sell the platform to build voice agents, we sell the finished virtual receptionist agent. See `competitors/vapi.md` for details.

## Status

Portfolio project. Concept stage.

## Session Memory

You can search through conversational history using the native Total Recall semantic memory search:
```bash
/recall <query>
```
To view the status of the last 10 messages of the project:
```bash
/status-report
```

## Agentic Development Team

Gemini CLI operates as **Coordinator**: a team coordinator that dispatches work to specialized sub-agents.

### Team Roster (16 agents)

| Agent | Role | Sub-agent Type |
|-------|------|---------------|
| **Neo** | Product Vision Interpreter | Core |
| **Morpheus** | Scrum Master | Core |
| **Trinity** | UX Architect | Core |
| **Switch** | Frontend Engineer | Core |
| **Tank** | Backend / Infra Engineer | Core |
| **Mouse** | Test Engineer | Core |
| **Agent Smith** | Code Review & Quality | Core |
| **Cipher** | Pentester | Security |
| **Niobe** | Security Engineer | Security |
| **Link** | Infrastructure Engineer | Infra |
| **Dozer** | Observability & Analytics | Infra |
| **Oracle** | AI Systems Advisor | Specialist |
| **Architect** | Domain Modeling Expert | Specialist |
| **Merovingian** | System Impact Analyst | Specialist |
| **Apoc** | Full-Stack Developer (Backup) | Flex |
| **Ghost** | Full-Stack Developer (Backup) | Flex |

### Methodology
- **Vertical user stories** (Scrum): "As a <persona> I want to <action> so that <end result>"
- **Lean Software Development**: Optimize lead time, minimize WIP, team swarms on stories
- **GitHub Flow**: Feature branches (`{type}-{story#}-{title}`) via git worktrees -> PR -> main

Agent prompt files are in `.gemini/agents/{name}.md`.

### Coordinator Protocol

1. Read the agent's definition file in `.gemini/agents/{name}.md` before invoking.
2. Delegate tasks to specialized agents using the native `invoke_agent` mechanism.
3. Once the sub-agent completes their task, synthesize their findings and carry forward the workflow.

