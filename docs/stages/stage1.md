# Stage 1 — Sign-in, request-ready master data, and the dashboard

Status: complete.

This stage is the first usable slice of the field service system. A company can sign in, keep the records a service request will need, and work in a dashboard. Requests, work orders, visits, parts, invoices, and feedback are later stages.

## Decisions

- The product is a real service platform. The web app is the MVP. A React Native client comes after the lifecycle is stable.
- The API and the web app are separate projects. There is no shared package. Paths, request bodies, status values, and error codes are the contract. Change the API first, then the web client.
- The API is Node.js, Express, and TypeScript. The web app is React, Vite, React Router, TanStack Query, React Hook Form, and Zod. The database is the existing local PostgreSQL. Docker is not used.
- Prisma 7 owns the schema and migrations. The connection string lives in `backend/prisma7.config.ts`. The client uses the PostgreSQL driver adapter. Services call Prisma directly. There is no repository layer.
- Tenancy is one organization per company. Every company-owned row carries `organizationId`. Identifiers are cuid strings. Models have `createdAt` and `updatedAt`.
- Roles for this stage are a fixed enum: `ADMIN`, `OPS`, `TECHNICIAN`, and `CUSTOMER`. Custom roles wait.
- Sign-in uses argon2 password hashes. The access token is a short-lived JWT kept in memory. The refresh token rotates, is stored as a hash, and is sent in an httpOnly cookie. Reuse of a revoked refresh token revokes that token family.
- Zod validates requests at the edge. Errors use `{ error: { code, message, details? } }`. Lists return `{ data, meta }`.
- Master data in this stage is only what a request needs: customers, contacts, addresses, assets, service types, and technicians. Skills, service areas, parts, and warehouses stay out.
- A customer login is optional. It is created when a contact is saved with a password, and that contact is how a customer is scoped to their own records.
- A technician is a user with role `TECHNICIAN` plus a technician profile, created together.
- Asset equipment type is plain text. Serial numbers are unique per organization. Asset status is `ACTIVE`, `OUT_OF_SERVICE`, or `DECOMMISSIONED`.
- Signed-in screens use a shadcn dashboard: sidebar, top bar, cards, and toasts. Login stays a full-page form outside that shell. The component set is Base UI, so links and triggers use `render`, not Radix `asChild`.
- An add action is a button on the right of the section heading. It opens a dialog with a backdrop. Cancel clears the form and closes the dialog. A successful save toasts and closes. A failed request toasts and leaves the dialog open. Field errors stay on the inputs.
- Admin and ops land on a home screen with counts for customers, service types, and technicians. A customer lands on their equipment. A technician lands on their profile.
- The local database name is `field_service`. The seeded company is Field Service Co. Every seeded user uses the password `Password123!`.

## Completed

- `backend/` and `frontend/` are separate apps, with module and feature folders and Cursor rules for layout, API style, React, data fetching, Prisma, and the dashboard.
- Identity is in place: organization, user, login, refresh, logout, and the current user. Route guards enforce the four roles.
- Master data is in the schema and in two applied migrations: customers, contacts, addresses, assets, service types, and technicians.
- The API exposes organization-scoped list, read, create, and update for those records. Customers can read only their own account. Technicians can read only their own profile. Writes are limited to admin and ops.
- The seed loads Field Service Co, the four role users, ABC Apartments with a linked contact and a primary address, one air conditioner, the Repair service type, and Tara Technician's profile.
- API tests cover login, refresh rotation, role denial, admin create, customer read of their own asset, and a technician blocked from creating a customer.
- The signed-in shell has a role sidebar, a top bar with breadcrumbs and a user menu, and admin home count cards.
- Customers, service types, technicians, equipment, and the technician profile render as cards. Loading uses skeletons. Empty lists use the empty state.
- New customer, service type, contact, address, asset, and technician each open from a heading button into a dialog. Editing an asset uses the same dialog.
- Local PostgreSQL accepts the app credentials. The `field_service` database exists, both migrations are applied, and the seed has been run. Admin sign-in and the add dialogs were exercised in the browser.

## Left for later stages

Password reset, invitations, an audit log, skills, service areas, parts, warehouses, requests, work orders, visits, invoices, notifications, Docker, Redis, and background jobs were discussed in the execution plan and were not part of this stage.
