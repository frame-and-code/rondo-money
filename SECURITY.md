# Security policy

## Reporting a vulnerability

Use GitHub's **private vulnerability reporting**: open the repository's **Security** tab →
**Advisories** → **Report a vulnerability**, or go straight to
<https://github.com/yauhen-brouka/fin-flow/security/advisories/new>. It reaches the
maintainer privately, and the discussion stays out of public view until a fix exists.

(The link is spelled out in full on purpose: GitHub renders this file both as a file and as
the repository's security policy page, and a repository-relative link does not survive
both.)

Please do not open a public issue for a security problem. Issues are disabled on this
repository anyway — private reports are the only channel that is watched.

Include what you would want to receive yourself: what the problem is, how to reproduce
it, and what an attacker gets out of it. A proof of concept helps more than a scanner
report.

## What to expect

This is a single-person project in pre-alpha, so there is no response-time guarantee and
no bug bounty. Reports are read and answered as time allows. Credit in the published
advisory is offered by default — say so if you would rather stay anonymous.

## Scope

**In scope:** the code in this repository.

**Out of scope:** self-hosted instances run by someone else, and the third-party services
this project depends on (Clerk, Railway, Postgres). Report those to whoever operates
them. If you are self-hosting, your deployment, your keys, and your database are yours to
secure.

There are no releases yet, so there is nothing to backport to: fixes land on `main`.
