# Stage 2 — Request to work order

Status: complete.

A customer can report a problem on equipment they already have. Admin and ops triage that request. Accepting it creates a work order with nobody assigned. Technicians do not take part in this stage.

## Decisions

- A service request belongs to one organization, one customer, one asset, and one service type. The asset's customer and address are copied onto the request when it is filed, so a later address edit does not rewrite the request.
- The customer, contact, and address come from the asset. The create body is the asset, the service type, a description, and a preferred date window. `preferredEnd` must be on or after `preferredStart`.
- Priority is `LOW`, `NORMAL`, `HIGH`, or `URGENT`, and it defaults to `NORMAL`. Admin and ops may set it when filing or accepting. A customer who sends a priority is rejected.
- Request status is `SUBMITTED`, `NEEDS_INFO`, `REJECTED`, or `ACCEPTED`. `ACCEPTED` and `REJECTED` are terminal. Asking for information and replying move between `SUBMITTED` and `NEEDS_INFO`. Any other transition returns `409` with code `INVALID_TRANSITION`.
- The triage thread is `ServiceRequestNote`: the question, the reply, the rejection reason, and the acceptance note. Reject and request-info require a message. Accept may include a note; if it does not, the note is "Accepted".
- Accept writes the note, sets the request to `ACCEPTED`, and creates the work order in one transaction. The work order copies the request's customer, asset, address, service type, priority, and description. Its status is `OPEN` only. It has no technician and no visit.
- A customer sees only requests for the customer linked through their contact. A request in the same organization that belongs to someone else returns `403`. A technician receives `403` on requests and work orders.
- Customers can read service types so they can pick an active one when filing. They cannot create or edit service types.
- Work orders are read-only in this stage. The list links each row back to its request.
- Admin and ops home gains a count of open requests (`SUBMITTED` and `NEEDS_INFO`). A customer still lands on their equipment.

## Completed

- `ServiceRequest`, `ServiceRequestNote`, and `WorkOrder` are in the schema. Migration `20260929064305_add_service_requests` is applied.
- The API exposes create, list, and read for requests; accept, reject, request-info, and reply; and read-only work orders. Role checks match the decisions above.
- The seed files one `SUBMITTED` request on the ABC Apartments air conditioner for the Repair service type: "The air conditioner is not cooling."
- API tests cover a customer creating a request and being denied another customer's request, ops accepting into an open work order, a second accept returning `409`, reject and request-info recording a note, a reply returning the request to `SUBMITTED`, and a technician blocked from listing requests.
- The customer sidebar has Requests. The list has a New request dialog for equipment, an active service type, the description, and the two dates. Detail shows status, the address snapshot, the thread, and a reply dialog while the status is `NEEDS_INFO`.
- Admin and ops have Requests and Work orders. The queue filters by status. Detail has Accept (with priority), Reject, and Request info dialogs. Work orders are a read-only list whose customer name links to the request.
- Admin and ops home shows the open-request count beside the existing counts.

## Left for later stages

Assignment, visits, attachments, parts, skills, service areas, warehouses, and SLA clocks stay out. Password reset, invitations, and an audit log are still later.
