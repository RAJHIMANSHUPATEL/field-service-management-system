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
| Work orders | Read, assign, schedule | Read, assign, schedule | Read own, accept, decline | — |
| Visits | — | — | Move own visit (en route, arrive, start) | — |
| Users and invitations | Read, invite, revoke | — | — | — |
| Audit events | Read | — | — | — |

Public endpoints: register a new organization (its first admin), login, refresh, logout, password reset request and confirm, accept invitation.
