# Stage 8 — Master data: company setup, skills, service areas, parts, warehouses

Status: complete.

Closes Phase 2. A new admin creates a company from an empty database and sets up everything else: service types, skills, service areas, parts catalogue, warehouses and vans, technicians with skills and areas, customers, contacts, addresses, and assets with warranty.

## Decisions

- `POST /api/v1/auth/register` creates an organization and its first admin. This follows the multi-tenant assumption in README section 4.1. Emails are unique across organizations, because sign-in looks a user up by email alone.
- Service areas are lists of postal codes. This follows the pincode-first assumption in README section 4.8.
- Parts have an SKU that is unique per organization and stored in upper case. `unitPrice` is `Decimal(12, 2)` with a currency code, `INR` by default. Amounts go over the API as strings.
- A warehouse is `WAREHOUSE` or `VAN`. A van belongs to exactly one technician, and a technician has at most one van.
- Technician skills and areas are set with `PATCH /technicians/:id` (`skillIds`, `serviceAreaIds`). IDs from another organization return `404`.
- Skills and service areas are readable by admin and ops. Parts and warehouses are also readable by technicians, for later van stock work. Writes are admin and ops, the same as service types.
- Records are switched off with `isActive`, not deleted.

## Completed

- Migration `add_skills_areas_parts_warehouses`.
- API modules `skills`, `serviceAreas`, `parts` and `warehouses`, plus the technician skill and area links. The seed adds realistic rows for each.
- `companySetup.test.ts` starts from an empty database and sets up a whole company through the API. It also covers duplicates, a bad price, van rules, wrong roles, and other organizations. The permission matrix test includes the new resources.
- Web: Set up your company (`/register`), Master data (`/master`) with add and activate controls, Assets (`/assets`) with warranty status, and a skills and areas dialog on Technicians. `e2e/tests/company-setup.spec.ts` does the whole setup in a browser.

## Left for later stages

Stock levels (Phase 6), editing catalogue rows beyond on and off, and asset transfer between owners stay out.
