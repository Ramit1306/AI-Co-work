# AI-Cowork

**Multi-Agentic AI Assistant for the Entire SDLC**  
*Powered by Qwen open-source LLMs, LangGraph, and CrewAI*

AI-Cowork is a **multi-agent system** designed to assist developers across all phases of the Software Development Life Cycle (SDLC). It provides a seamless, Copilot-like experience inside VS Code and IntelliJ, while leveraging a **single Qwen model** for all agent interactions. The system uses **agentic memory** (LlamaIndex + Qdrant) to retain context, and its orchestration is built with **LangGraph** to enforce a strict **one-agent-per-SDLC-phase** policy, ensuring focused and uncorrupted assistance.

Built to **outperform GitHub Copilot** in every SDLC phase, AI-Cowork is evaluated using **RAGAS** metrics and comes with a full benchmarking suite to prove its superiority.

---

## Table of Contents

- [Key Features](#key-features)
- [Architecture Overview](#architecture-overview)
- [SDLC Phase Mapping](#sdlc-phase-mapping)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [Evaluation & Benchmarking](#evaluation--benchmarking)
- [Contributing](#contributing)
- [License](#license)

---

## Key Features

- **Multi-Agent Orchestration** – Six dedicated crews, each responsible for one SDLC phase, coordinated by LangGraph.
- **Single LLM Backend** – Uses only **Qwen** (open-source models from HuggingFace) for all tasks, ensuring consistency and cost control.
- **Agentic Memory** – Persistent, cross-session memory using LlamaIndex and Qdrant vector database, enabling context-aware suggestions.
- **Copilot‑Parity IDE Integration** – Native extensions for **VS Code** and **IntelliJ** with:
  - Inline ghost-text completions (same UX as GitHub Copilot)
  - Chat interface for natural language interaction
  - Full access to file system, symbols, and project context
- **Human‑in‑the‑Loop** – Approval interrupts for critical actions (e.g., code generation, deployment).
- **RAGAS‑Based Evaluation** – Built‑in benchmarking suite comparing AI‑Cowork against GitHub Copilot across all SDLC phases.
- **Fully Local & Confidential** – All code, memory, and LLM inference stay on your machine (or your private cloud) – no data leaves your control.

---

## Architecture Overview

The system is composed of four main layers:

1. **Orchestration Layer (LangGraph)**  
   Manages global state, routes requests to the appropriate crew, enforces phase‑specific agent execution, and handles human approval interrupts.

2. **Agent Layer (CrewAI)**  
   Six crews, each containing specialized agents (e.g., Researcher/Writer for Requirements, Architect for Design, Developer for Implementation, etc.). Each crew has a defined set of tasks and collaboration logic.

3. **Foundation Layer**  
   - **LLM**: A single shared instance of Qwen (configurable model) for all crews.  
   - **Memory**: LlamaIndex + Qdrant for long‑term storage and retrieval of project context, decisions, and historical interactions.  
   - **Tools**: File system read/write, symbol search, linter, test runner, Git operations, etc.

4. **IDE Integration Layer**  
   - **VS Code** & **IntelliJ** plugins communicate with the backend via a shared WebSocket/HTTP protocol.  
   - Provides inline completions, chat, and command integration.

The entire system is built as a FastAPI server with a pluggable architecture, enabling easy extension and customization.

---

## SDLC Phase Mapping

AI‑Cowork adheres to the exact phase breakdown from the evaluation spreadsheet, with **one crew per phase**:

| Phase | Crew | Agents | Key Responsibilities |
|-------|------|--------|-----------------------|
| **Requirement** | `requirement_crew` | Researcher, Writer | Parse natural language requirements, produce structured specifications and documentation. |
| **Design** | `design_crew` | Software Architects | Generate architecture blueprints, apply SOLID principles, create UML diagrams. |
| **Implementation** | `implementation_crew` | Developers | Chat‑based coding, autonomous refactoring, context‑aware generation, security‑aware coding, low‑latency completions. |
| **Unit Testing** | `testing_crew` | Test Engineers | Generate JUnit/TestNG tests, smart test generation for Spring/Micronaut/Quarkus. |
| **Documentation** | `documentation_crew` | Technical Writers | Produce API docs, wikis, user guides, architecture overviews. |
| **Deployment** | `deployment_crew` | DevOps Engineers | Generate Dockerfiles, Kubernetes manifests, CI/CD pipelines, observability configs. |

*Security‑Aware Coding is included inside the Implementation crew, as per the original specification.*

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| **LLM** | Qwen (open‑source models from HuggingFace) |
| **Orchestration** | LangGraph |
| **Agents** | CrewAI |
| **Memory** | LlamaIndex + Qdrant (vector DB) |
| **Backend API** | FastAPI (Python) |
| **IDE Extensions** | VS Code (TypeScript), IntelliJ (Kotlin) |
| **Protocol** | WebSocket + HTTP, shared JSON schema |
| **Evaluation** | RAGAS + custom metrics |
| **Infrastructure** | Docker, Kubernetes (optional), Prometheus/Grafana |