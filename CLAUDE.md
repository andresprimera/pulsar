# Project Coding Rules & Architecture Guardrails

You are working inside an existing NestJS + MongoDB (Mongoose) backend.

Your goal is to add or modify features without breaking existing behavior, while strictly following established architecture and conventions.

## 1. Architecture Principles (DO NOT VIOLATE)
### Layered Architecture

The project follows a strict layered structure:

**Controller**
- Handles HTTP only
- No business logic
- No direct database access
- Delegates to services

**Service**
- Contains business logic
- Enforces lifecycle rules and validations
- Never accesses Mongoose models directly
- Uses repositories only

**Repository**
- The ONLY layer allowed to access Mongoose models
- No business logic
- No HTTP concerns
- Pure data access

❌ Do NOT skip layers
❌ Do NOT access models outside repositories
❌ Do NOT add logic to controllers

### Allowed Cross-Layer Exceptions

**SeederService → OnboardingService**
- SeederService (in `src/database`) may depend on OnboardingService (application layer)
- This is acceptable because:
  - SeederService is infrastructure-only (runs at startup)
  - Not used in request handling
  - Not reused elsewhere
  - Uses `forwardRef()` to resolve circular dependency with OnboardingModule

## 2. Database & Data Rules

### MongoDB with Mongoose
- Schemas live in `src/database/schemas`
- Repositories live in `src/database/repositories`
- Repositories must be registered in `DatabaseModule`

### Lifecycle Management
- No hard deletes
- Entities use a status field:
  - `active`
  - `inactive`
  - `archived`
- Archived entities:
  - Cannot be modified
  - Cannot change status
  - Must still be readable
- Lifecycle rules are enforced in services, not controllers.

## 3. Validation & DTOs

- All input must use DTOs
- DTOs must use `class-validator`
- No raw request bodies in services
- DTOs live close to their feature module

❌ Do NOT validate inside controllers manually
❌ Do NOT trust raw input

## 4. Modules & Registration

- Each feature has its own module
- Modules must:
  - Declare controllers
  - Declare services
- Database-related providers are registered in `DatabaseModule`
- New schemas or repositories MUST be exported if used elsewhere

❌ Do NOT register repositories inside feature modules
❌ Do NOT create circular dependencies

## 5. API Design Rules

- RESTful conventions
- Thin controllers
- Clear endpoint responsibilities
- Status updates use dedicated endpoints (e.g. `/status`)
  - Example:
    - `PATCH /resource/:id` → update fields
    - `PATCH /resource/:id/status` → lifecycle only

## 6. Error Handling

- Use NestJS exceptions (`NotFoundException`, `BadRequestException`, etc.)
- No silent failures
- Errors must reflect real business constraints

❌ Do NOT return `null` or `false` for errors
❌ Do NOT swallow exceptions

## 7. Backward Compatibility (CRITICAL)

- Do NOT break existing endpoints
- Do NOT rename fields without explicit instruction
- Do NOT change behavior unless requested
- Prefer additive changes over refactors
- If unsure: ➡️ Add new code instead of modifying existing logic

## 8. Scope Discipline

- Implement ONLY what is requested
- Do NOT add "nice to have" improvements
- Do NOT refactor unrelated code
- Do NOT introduce auth, caching, queues, or async jobs unless explicitly requested

## 9. Code Style & Quality

- Follow existing naming conventions
- Keep functions small and explicit
- Prefer clarity over cleverness
- Avoid deep nesting
- No commented-out code

## 10. What to Do If Something Is Missing

If a dependency, pattern, or rule is unclear:
- Infer it from existing code
- Mirror similar features (e.g. Agents CRUD)
- Do NOT invent new patterns
- Do NOT ask the user unless absolutely blocking

## 11. Summary Rule (MOST IMPORTANT)

Do not be creative with architecture.
Be boring, consistent, and predictable.

Your success is measured by:
- Minimal diff
- Zero regressions
- Full alignment with existing patterns
