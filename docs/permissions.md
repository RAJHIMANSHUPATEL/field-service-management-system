# Permission matrix

Every query is scoped to the caller's organization. A record in another organization returns the module's `404`. A role that lacks the right returns `403 FORBIDDEN`. `backend/src/modules/auth/permissions.test.ts` checks the read column for each role.

| Resource | Admin | Ops | Technician | Customer |
|---|---|---|---|---|
| Customers, contacts, addresses | Read, write | Read, write | — | Read own company |
| Assets | Read, write | Read, write | — | Read own |
| Service types | Read, write | Read, write | — | Read |
| Service requests | Read, triage | Read, triage | — | Create, read own, reply |
| Skills, service areas | Read, write | Read, write | — | — |
| Parts catalogue, warehouses and vans | Read, write | Read, write | Read | — |
| Technicians | Read, write | Read, write | Read own profile | — |
| Work orders | Read, assign, schedule, reassign, candidates | Read, assign, schedule, reassign, candidates | Read own, accept, decline | — |
| Visits | Reschedule, cancel, calendar | Reschedule, cancel, calendar | Move own visit (en route, arrive, start, complete, unsuccessful), report, photos, signature, own calendar | — |
| Work order notes | Add | Add | Add on own job | — |
| Visit photos and signature | Read | Read | Read own | Read on own jobs |
| Stock and ledger | Read, receive, transfer, adjust | Read, receive, transfer, adjust | Read own van | — |
| Part requests | Read, fulfil, cancel | Read, fulfil, cancel | Raise when ending a visit | — |
| Visit parts | — | — | Reserve, use, release, return on own visit | — |
| Invoices | Read, adjust draft, issue, record payment, void | Read, adjust draft, issue, record payment, void | — | Read own issued, pay online |
| Contracts | Read, create, cancel | Read, create, cancel | — | Read own |
| Service report PDF | Read | Read | Read own job | Read own job |
| Technician time off | Read, add, delete | Read, add, delete | Read own | — |
| Users and invitations | Read, invite, revoke | — | — | — |
| Audit events | Read | — | — | — |

Public endpoints: register a new organization (its first admin), login, refresh, logout, password reset request and confirm, accept invitation.
