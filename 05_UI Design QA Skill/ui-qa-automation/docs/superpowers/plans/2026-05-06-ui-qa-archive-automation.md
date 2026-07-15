# UI QA Archive Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an automatic UI QA archive and insight pipeline with configurable auto/review/manual modes.

**Architecture:** A Python CLI reads `internal/report.json`, copies the current audit deliverables into `ui-qa-automation/archive/runs/<run-id>/`, also stores report outputs in `ui-qa-automation/reports/runs/YYYY-MM-DD/<timestamp>/` plus `ui-qa-automation/reports/latest/`, appends normalized issues to `ui-qa-automation/archive/issues.jsonl`, regenerates aggregate stats, and writes insight/candidate markdown. `UI Design QA SKILL.md` owns the process rule; `skills/ui-qa-experience/SKILL.md` owns reusable QA experience.

**Tech Stack:** Python standard library, JSON/JSONL, Markdown, existing `internal/report.json` contract.

---

### Task 1: Archive CLI

**Files:**
- Create: `ui-qa-automation/scripts/qa_archive.py`
- Create: `ui-qa-automation/tests/test_qa_archive.py`
- Create: `ui-qa-automation/config/qa-automation.json`

- [ ] Write a failing unittest for archiving one sample report.
- [ ] Implement the CLI with idempotent run replacement by `run_id`.
- [ ] Run `python -m unittest discover -s ui-qa-automation/tests -v`.

### Task 2: Skill Documentation

**Files:**
- Modify: `UI Design QA SKILL.md`
- Create: `skills/ui-qa-experience/SKILL.md`

- [ ] Add a post-audit archive step to `UI Design QA SKILL.md`.
- [ ] Create `ui-qa-experience` as a separate experience skill.
- [ ] Verify the new skill frontmatter and trigger description are valid.

### Task 3: Current Run Archive

**Files:**
- Create/update: `ui-qa-automation/archive/runs/*`
- Create/update: `ui-qa-automation/archive/issues.jsonl`
- Create/update: `ui-qa-automation/archive/stats.json`
- Create/update: `ui-qa-automation/archive/qa-insights.md`
- Create/update: `ui-qa-automation/archive/skill-candidates.md`
- Create/update: `ui-qa-automation/reports/runs/YYYY-MM-DD/<timestamp>/*`
- Create/update: `ui-qa-automation/reports/latest/*`

- [ ] Run the archive CLI on the current `internal/report.json`.
- [ ] Verify issue counts, mode labels, copied deliverables, timestamped report output, latest report output, and candidate output.
