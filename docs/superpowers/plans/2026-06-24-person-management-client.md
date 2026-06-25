# Person Management — Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add create/edit/delete UI for persons and their member/volunteer/community roles to the Village Green Vue 3 client, using split single-purpose edit pages so each screen saves to exactly one role endpoint.

**Architecture:** `PersonDetail` becomes a hub with Edit/Member/Volunteer/Delete actions. A `PersonEditForm` handles core person fields + home village + Pride/Veteran community checkboxes (1–2 calls). Separate `MemberEdit` and `VolunteerEdit` pages each save to one role endpoint, gated on the person having a home village. Routing and form patterns mirror the existing `ServiceRequestCreateEdit.vue`.

**Tech Stack:** Vue 3 `<script setup>`, Vue Router, PrimeVue (`InputText`, `Select`, `MultiSelect`, `Checkbox`, `Button`, `useToast`), `apiCall` operation-driven client, `useAsyncState` composable.

## Global Constraints

- **Depends on Plan A** (`2026-06-24-person-management-backend.md`) being complete and verified — all `/persons` write endpoints, role sub-resources, and community endpoints must exist.
- Spec: `docs/superpowers/specs/2026-06-24-person-management-design.md`.
- No automated client tests are required (vitest exists but bootstrapping coverage is out of scope; manual verification only).
- `apiCall(operationId, params, body)` resolves the operation against the OAS — use the operationIds defined in Plan A: `createPerson`, `patchPerson`, `deletePerson`, `getPerson`, `putPersonMember`, `patchPersonMember`, `deletePersonMember`, `putPersonVolunteer`, `patchPersonVolunteer`, `deletePersonVolunteer`, `getPersonCommunities`, `putPersonCommunities`.
- Follow `ServiceRequestCreateEdit.vue` conventions: `isEdit` from route params, `useToast` for feedback, `router.push` on success/cancel, flush-right Cancel/Save buttons.
- Repoint Member/Volunteer list data from the removed village-scoped endpoints to `getPersons` with a `role`/`villageId` filter.

## File Structure

- **Modify** `client/src/router/index.js` — add create/edit routes for person, member, volunteer.
- **Create** `client/src/features/PersonList/components/PersonEditForm.vue` — core person + home village + community checkboxes.
- **Create** `client/src/features/PersonList/components/MemberEdit.vue` — member role page.
- **Create** `client/src/features/PersonList/components/VolunteerEdit.vue` — volunteer role page.
- **Modify** `client/src/features/PersonList/components/PersonDetail.vue` — add action buttons (hub).
- **Modify** `client/src/features/PersonList/api/personApi.js` — add write + community calls.
- **Create** `client/src/features/PersonList/api/roleApi.js` — member/volunteer write calls.
- **Modify** `client/src/features/MemberList/components/MemberList.vue` and `client/src/features/MemberList/api/memberApi.js` — repoint to `getPersons?role=member`.
- **Modify** `client/src/features/VolunteerList/components/VolunteerList.vue` and `client/src/features/VolunteerList/api/volunteerApi.js` — repoint to `getPersons?role=volunteer`.

---

## Task 1: API client functions

**Files:**
- Modify: `client/src/features/PersonList/api/personApi.js`
- Create: `client/src/features/PersonList/api/roleApi.js`

**Interfaces:**
- Produces: `createPerson(body)`, `patchPerson(personId, body)`, `deletePerson(personId)`, `getPerson(personId, projection)`, `getPersonCommunities(personId)`, `putPersonCommunities(personId, communityIds)`, `getCommunities()`, `getCapabilities()`; and in `roleApi.js`: `putMember`, `patchMember`, `deleteMember`, `putVolunteer`, `patchVolunteer`, `deleteVolunteer`.

- [ ] **Step 1: Extend `personApi.js`**

Append to `client/src/features/PersonList/api/personApi.js`:

```javascript
export const getPerson = (personId, projection = []) =>
  apiCall('getPerson', { personId, projection })

export const createPerson = (body) => apiCall('createPerson', {}, body)

export const patchPerson = (personId, body) =>
  apiCall('patchPerson', { personId }, body)

export const deletePerson = (personId) => apiCall('deletePerson', { personId })

export const getPersonCommunities = (personId) =>
  apiCall('getPersonCommunities', { personId })

export const putPersonCommunities = (personId, communityIds) =>
  apiCall('putPersonCommunities', { personId }, { communityIds })

// Lookups (Plan A Task 8.5): full lists for id<->name resolution.
export const getCommunities  = () => apiCall('getCommunities')
export const getCapabilities = () => apiCall('getCapabilities')
```

- [ ] **Step 2: Create `roleApi.js`**

Create `client/src/features/PersonList/api/roleApi.js`:

```javascript
import { apiCall } from '../../../shared/api/apiClient.js'

export const putMember    = (personId, body) => apiCall('putPersonMember', { personId }, body)
export const patchMember  = (personId, body) => apiCall('patchPersonMember', { personId }, body)
export const deleteMember = (personId)        => apiCall('deletePersonMember', { personId })

export const putVolunteer    = (personId, body) => apiCall('putPersonVolunteer', { personId }, body)
export const patchVolunteer  = (personId, body) => apiCall('patchPersonVolunteer', { personId }, body)
export const deleteVolunteer = (personId)        => apiCall('deletePersonVolunteer', { personId })
```

- [ ] **Step 3: Verify the client builds**

Run: `cd client && npm run build` (or the dev server is already running and hot-reloads).
Expected: no import/resolution errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/features/PersonList/api/personApi.js \
        client/src/features/PersonList/api/roleApi.js
git commit -m "feat(client): person and role API client functions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Routes for create/edit pages

**Files:**
- Modify: `client/src/router/index.js`

**Interfaces:**
- Produces: named routes `meta-person-create`, `meta-person-edit`, `meta-person-member`, `meta-person-volunteer`.

- [ ] **Step 1: Add routes**

In `client/src/router/index.js`, immediately after the `meta-persons` route block (around line 108-111), add:

```javascript
  {
    path: '/meta/persons/create',
    name: 'meta-person-create',
    component: () => import('../features/PersonList/components/PersonEditForm.vue'),
  },
  {
    path: '/meta/persons/:personId/edit',
    name: 'meta-person-edit',
    component: () => import('../features/PersonList/components/PersonEditForm.vue'),
  },
  {
    path: '/meta/persons/:personId/member',
    name: 'meta-person-member',
    component: () => import('../features/PersonList/components/MemberEdit.vue'),
  },
  {
    path: '/meta/persons/:personId/volunteer',
    name: 'meta-person-volunteer',
    component: () => import('../features/PersonList/components/VolunteerEdit.vue'),
  },
```

Note: place `create` BEFORE the existing `:personId/:personName?` detail route so `/meta/persons/create` is not captured as a `personId`.

- [ ] **Step 2: Verify**

Run: dev server reload.
Expected: no router errors (components are created in later tasks; the dynamic `import()` is lazy so the app still boots — but to avoid a broken nav, do not link these routes until their components exist).

- [ ] **Step 3: Commit**

```bash
git add client/src/router/index.js
git commit -m "feat(client): routes for person create/edit and role pages

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: PersonEditForm (core person + home village + community)

**Files:**
- Create: `client/src/features/PersonList/components/PersonEditForm.vue`

**Interfaces:**
- Consumes: `getPerson`, `createPerson`, `patchPerson`, `getPersonCommunities`, `putPersonCommunities`, `getCommunities` (personApi); a villages source for the home-village `Select` (see Step 1).
- Produces: a route component for `meta-person-create` and `meta-person-edit`.

- [ ] **Step 1: Identify the villages data source**

The home-village `Select` needs the list of villages the user can assign. `ServiceRequestCreateEdit.vue` already loads villages for its village `Select`.

Run: `grep -nE "village|getVillages|apiCall\('getVillages'|VillageList" client/src/features/ServiceRequestList/components/ServiceRequestCreateEdit.vue | head`
Use the SAME operationId/source it uses (e.g. `apiCall('getVillages')` or an existing villageApi). Reuse, do not invent.

- [ ] **Step 2: Community id resolution (via the getCommunities lookup)**

Plan A Task 8.5 adds `GET /communities` → `[{ communityId, name }]`, exposed in the client as `getCommunities()`. On mount, fetch it once and build a `communityNameToId` Map. The two checkboxes are bound to a `Set` of community **names** (`'Pride'`, `'Veteran'`); on save, translate names→ids through that map. For the edited person, `getPersonCommunities(personId)` gives the currently-checked names. No hardcoding, no environment-id assumptions.

- [ ] **Step 3: Create the component**

Create `client/src/features/PersonList/components/PersonEditForm.vue`:

```vue
<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import Button from 'primevue/button'
import {
  getPerson, createPerson, patchPerson,
  getPersonCommunities, putPersonCommunities, getCommunities,
} from '../api/personApi.js'

const router = useRouter()
const route = useRoute()
const toast = useToast()

const isEdit = computed(() => !!route.params.personId)
const personId = computed(() => route.params.personId)

const form = reactive({
  fullName: '', firstName: '', lastName: '', nickname: '',
  address: '', city: '', state: '', zip: '',
  email: '', phone: '', cell: '', birthDate: '',
  emergencyContactName: '', emergencyContactRelationship: '',
  emergencyContactPhone: '', emergencyContactEmail: '',
  villageId: null,
})

const villages = ref([])          // [{ villageId, name }]
const allCommunities = ref([])    // [{ communityId, name }] from getCommunities()
const communityNameToId = computed(() =>
  new Map(allCommunities.value.map(c => [c.name, c.communityId])))
const communityNames = ref(new Set())   // Set<'Pride'|'Veteran'>
let originalCommunityNames = new Set()

// Load villages (reuse the project's villages source — see Task 3 Step 1)
async function loadVillages () {
  // Replace with the project's villages operationId/api confirmed in Step 1, e.g.:
  // const { apiCall } = await import('../../../shared/api/apiClient.js')
  // villages.value = await apiCall('getVillages')
}

onMounted(async () => {
  await loadVillages()
  allCommunities.value = await getCommunities()   // [{ communityId, name }]
  if (isEdit.value) {
    const p = await getPerson(personId.value, [])
    Object.keys(form).forEach(k => { if (p[k] !== undefined && p[k] !== null) form[k] = p[k] })
    form.villageId = p.village?.villageId ?? null
    const comms = await getPersonCommunities(personId.value)
    originalCommunityNames = new Set(comms.map(c => c.name))
    communityNames.value = new Set(originalCommunityNames)
  }
})

function buildPayload () {
  const payload = {}
  Object.entries(form).forEach(([k, v]) => {
    if (k === 'villageId') return
    if (v !== '' && v !== null) payload[k] = v
  })
  payload.villageId = form.villageId ?? null   // explicit null clears home village
  return payload
}

async function handleSubmit () {
  if (!form.fullName) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Full name is required', life: 3000 })
    return
  }
  try {
    let id = personId.value
    if (isEdit.value) {
      await patchPerson(id, buildPayload())
    }
    else {
      const created = await createPerson(buildPayload())
      id = created.personId
    }
    // Community: only call if changed. Translate selected names → ids.
    if (communitiesChanged()) {
      await putPersonCommunities(id, communityNamesToIds(communityNames.value))
    }
    toast.add({ severity: 'success', summary: 'Saved', detail: isEdit.value ? 'Person updated' : 'Person created', life: 2000 })
    router.push({ name: 'meta-person-detail', params: { personId: id } })
  }
  catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save person', life: 3000 })
  }
}

function communitiesChanged () {
  if (communityNames.value.size !== originalCommunityNames.size) return true
  for (const n of communityNames.value) if (!originalCommunityNames.has(n)) return true
  return false
}

function communityNamesToIds (names) {
  return [...names].map(n => communityNameToId.value.get(n)).filter(Boolean)
}

function toggleCommunity (name, checked) {
  if (checked) communityNames.value.add(name)
  else communityNames.value.delete(name)
  communityNames.value = new Set(communityNames.value)
}

function cancel () {
  router.push(isEdit.value
    ? { name: 'meta-person-detail', params: { personId: personId.value } }
    : { name: 'meta-persons' })
}
</script>

<template>
  <div class="person-edit" style="padding:2rem;max-width:900px;">
    <h2>{{ isEdit ? 'Edit Person' : 'Create Person' }}</h2>
    <form class="form" style="display:flex;flex-direction:column;gap:1rem;" @submit.prevent="handleSubmit">
      <label>Full Name <InputText v-model="form.fullName" /></label>
      <label>First Name <InputText v-model="form.firstName" /></label>
      <label>Last Name <InputText v-model="form.lastName" /></label>
      <label>Nickname <InputText v-model="form.nickname" /></label>
      <label>Home Village
        <Select v-model="form.villageId" :options="villages" optionLabel="name" optionValue="villageId"
                placeholder="(no home village)" showClear />
      </label>
      <label>Email <InputText v-model="form.email" /></label>
      <label>Phone <InputText v-model="form.phone" /></label>
      <label>Cell <InputText v-model="form.cell" /></label>
      <label>Address <InputText v-model="form.address" /></label>
      <label>City <InputText v-model="form.city" /></label>
      <label>State <InputText v-model="form.state" /></label>
      <label>Zip <InputText v-model="form.zip" /></label>
      <label>Birth Date <InputText v-model="form.birthDate" placeholder="YYYY-MM-DD" /></label>

      <fieldset>
        <legend>Communities</legend>
        <label><Checkbox :modelValue="communityNames.has('Pride')" binary
                @update:modelValue="v => toggleCommunity('Pride', v)" /> Pride</label>
        <label><Checkbox :modelValue="communityNames.has('Veteran')" binary
                @update:modelValue="v => toggleCommunity('Veteran', v)" /> Veteran</label>
      </fieldset>

      <h3>Emergency Contact</h3>
      <label>Name <InputText v-model="form.emergencyContactName" /></label>
      <label>Relationship <InputText v-model="form.emergencyContactRelationship" /></label>
      <label>Phone <InputText v-model="form.emergencyContactPhone" /></label>
      <label>Email <InputText v-model="form.emergencyContactEmail" /></label>

      <div style="display:flex;justify-content:flex-end;gap:0.5rem;">
        <Button type="button" label="Cancel" severity="secondary" @click="cancel" />
        <Button type="submit" label="Save" />
      </div>
    </form>
  </div>
</template>
```

- [ ] **Step 4: Wire the villages source**

Replace the `loadVillages()` body with the project's confirmed villages operationId from Step 1 (e.g. `villages.value = await apiCall('getVillages')`). The component must not ship with an empty `loadVillages()`. The community id map is already wired via `getCommunities()` in `onMounted` + `communityNamesToIds` — no stub remains there.

- [ ] **Step 5: Verify manually**

Run: dev server. Navigate to `/meta/persons/create`.
- Create a person with just a full name (no home village) → redirects to detail; person exists.
- Edit an existing person, change a field, check Pride → save → detail reflects change; `getPersonCommunities` shows Pride.
Expected: create and edit both work; community checkbox persists.

- [ ] **Step 6: Commit**

```bash
git add client/src/features/PersonList/components/PersonEditForm.vue
git commit -m "feat(client): PersonEditForm for create/edit with home village and communities

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: MemberEdit page

**Files:**
- Create: `client/src/features/PersonList/components/MemberEdit.vue`

**Interfaces:**
- Consumes: `getPerson`, `putMember`, `patchMember`, `deleteMember` (roleApi/personApi).
- Produces: route component for `meta-person-member`.

- [ ] **Step 1: Create the component**

Create `client/src/features/PersonList/components/MemberEdit.vue`:

```vue
<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import { getPerson } from '../api/personApi.js'
import { putMember, patchMember, deleteMember } from '../api/roleApi.js'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const personId = computed(() => route.params.personId)

const person = ref(null)
const hasMember = ref(false)
const hasHomeVillage = computed(() => !!person.value?.village?.villageId)
const form = reactive({ memberNumber: '', memberLevel: '', serviceNotes: '', joinDate: '' })

onMounted(async () => {
  const p = await getPerson(personId.value, ['memberInfo'])
  person.value = p
  if (p.memberInfo) {
    hasMember.value = true
    Object.keys(form).forEach(k => { if (p.memberInfo[k] != null) form[k] = p.memberInfo[k] })
  }
})

function payload () {
  const out = {}
  Object.entries(form).forEach(([k, v]) => { if (v !== '') out[k] = v })
  return out
}

async function save () {
  try {
    if (hasMember.value) await patchMember(personId.value, payload())
    else await putMember(personId.value, payload())
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Member role saved', life: 2000 })
    back()
  }
  catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save member role', life: 3000 })
  }
}

async function revoke () {
  try {
    await deleteMember(personId.value)
    toast.add({ severity: 'success', summary: 'Revoked', detail: 'Member role revoked', life: 2000 })
    back()
  }
  catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to revoke', life: 3000 })
  }
}

function back () { router.push({ name: 'meta-person-detail', params: { personId: personId.value } }) }
</script>

<template>
  <div style="padding:2rem;max-width:700px;">
    <h2>Member Role — {{ person?.fullName }}</h2>

    <div v-if="!hasHomeVillage" class="notice">
      Set a home village on the person before granting a member role.
      <Button label="Back" severity="secondary" @click="back" />
    </div>

    <form v-else style="display:flex;flex-direction:column;gap:1rem;" @submit.prevent="save">
      <label>Member # <InputText v-model="form.memberNumber" /></label>
      <label>Member Level <InputText v-model="form.memberLevel" /></label>
      <label>Service Notes <InputText v-model="form.serviceNotes" /></label>
      <label>Join Date <InputText v-model="form.joinDate" placeholder="YYYY-MM-DD" /></label>
      <div style="display:flex;justify-content:flex-end;gap:0.5rem;">
        <Button v-if="hasMember" type="button" label="Revoke Role" severity="danger" @click="revoke" />
        <Button type="button" label="Cancel" severity="secondary" @click="back" />
        <Button type="submit" :label="hasMember ? 'Save' : 'Grant Member Role'" />
      </div>
    </form>
  </div>
</template>

<style scoped>
.notice { padding:1rem;border:1px solid var(--color-border-default);border-radius:6px;display:flex;flex-direction:column;gap:1rem;align-items:flex-start; }
</style>
```

- [ ] **Step 2: Verify manually**

Run: dev server.
- Open `/meta/persons/<personWithNoHomeVillage>/member` → shows the notice, no form.
- Open `/meta/persons/<personWithHomeVillage>/member` → grant role, then re-open → fields populated, "Save" + "Revoke Role" shown; revoke removes the role.
Expected: gating works; grant/patch/revoke all function.

- [ ] **Step 3: Commit**

```bash
git add client/src/features/PersonList/components/MemberEdit.vue
git commit -m "feat(client): MemberEdit page with home-village gating

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: VolunteerEdit page

**Files:**
- Create: `client/src/features/PersonList/components/VolunteerEdit.vue`

**Interfaces:**
- Consumes: `getPerson`, `getCapabilities` (personApi), `putVolunteer`, `patchVolunteer`, `deleteVolunteer` (roleApi); a villages option source.
- Produces: route component for `meta-person-volunteer`.

- [ ] **Step 1: Identify the village option source**

Capabilities come from `getCapabilities()` (Plan A Task 8.5 → `GET /capabilities` → `[{ capabilityId, name }]`), already added to `personApi.js` in Task 1. For associate villages, use the same villages source confirmed in Task 3 Step 1.

Run: `grep -rnE "getVillages|villageApi" client/src --include=*.js --include=*.vue | head`
Use the confirmed villages operationId. Do not invent a capabilities source — use `getCapabilities()`.

- [ ] **Step 2: Create the component**

Create `client/src/features/PersonList/components/VolunteerEdit.vue`:

```vue
<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import MultiSelect from 'primevue/multiselect'
import Button from 'primevue/button'
import { getPerson, getCapabilities } from '../api/personApi.js'
import { putVolunteer, patchVolunteer, deleteVolunteer } from '../api/roleApi.js'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const personId = computed(() => route.params.personId)

const person = ref(null)
const hasVolunteer = ref(false)
const hasHomeVillage = computed(() => !!person.value?.village?.villageId)

const capabilityOptions = ref([])   // [{ capabilityId, name }] from getCapabilities()
const villageOptions = ref([])      // [{ villageId, name }] from the villages source (Step 1)
const selectedCapabilityIds = ref([])
const selectedAssociateVillageIds = ref([])

// Load the villages option source confirmed in Step 1 (e.g. apiCall('getVillages')).
async function loadVillageOptions () {
  // villageOptions.value = await apiCall('getVillages')
}

onMounted(async () => {
  capabilityOptions.value = await getCapabilities()
  await loadVillageOptions()
  const p = await getPerson(personId.value, ['volunteerInfo'])
  person.value = p
  if (p.volunteerInfo) {
    hasVolunteer.value = true
    // volunteerInfo.capabilities are names; map to ids via capabilityOptions
    const nameToId = new Map(capabilityOptions.value.map(c => [c.name, c.capabilityId]))
    selectedCapabilityIds.value = (p.volunteerInfo.capabilities ?? []).map(n => nameToId.get(n)).filter(Boolean)
    selectedAssociateVillageIds.value = (p.volunteerInfo.associateVillages ?? []).map(v => v.villageId)
  }
})

async function save () {
  const body = {
    capabilityIds: selectedCapabilityIds.value,
    associateVillageIds: selectedAssociateVillageIds.value,
  }
  try {
    if (hasVolunteer.value) await patchVolunteer(personId.value, body)
    else await putVolunteer(personId.value, body)
    toast.add({ severity: 'success', summary: 'Saved', detail: 'Volunteer role saved', life: 2000 })
    back()
  }
  catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to save volunteer role', life: 3000 })
  }
}

async function revoke () {
  try {
    await deleteVolunteer(personId.value)
    toast.add({ severity: 'success', summary: 'Revoked', detail: 'Volunteer role revoked', life: 2000 })
    back()
  }
  catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to revoke', life: 3000 })
  }
}

function back () { router.push({ name: 'meta-person-detail', params: { personId: personId.value } }) }
</script>

<template>
  <div style="padding:2rem;max-width:700px;">
    <h2>Volunteer Role — {{ person?.fullName }}</h2>

    <div v-if="!hasHomeVillage" class="notice">
      Set a home village on the person before granting a volunteer role.
      <Button label="Back" severity="secondary" @click="back" />
    </div>

    <form v-else style="display:flex;flex-direction:column;gap:1rem;" @submit.prevent="save">
      <label>Capabilities
        <MultiSelect v-model="selectedCapabilityIds" :options="capabilityOptions"
                     optionLabel="name" optionValue="capabilityId" display="chip" placeholder="Select capabilities" />
      </label>
      <label>Associate Villages
        <MultiSelect v-model="selectedAssociateVillageIds" :options="villageOptions"
                     optionLabel="name" optionValue="villageId" display="chip" placeholder="Select villages" />
      </label>
      <div style="display:flex;justify-content:flex-end;gap:0.5rem;">
        <Button v-if="hasVolunteer" type="button" label="Revoke Role" severity="danger" @click="revoke" />
        <Button type="button" label="Cancel" severity="secondary" @click="back" />
        <Button type="submit" :label="hasVolunteer ? 'Save' : 'Grant Volunteer Role'" />
      </div>
    </form>
  </div>
</template>

<style scoped>
.notice { padding:1rem;border:1px solid var(--color-border-default);border-radius:6px;display:flex;flex-direction:column;gap:1rem;align-items:flex-start; }
</style>
```

- [ ] **Step 3: Wire the villages option source**

Capabilities already load via `getCapabilities()` in `onMounted`. Replace the `loadVillageOptions()` body with the confirmed villages operationId from Step 1 (e.g. `villageOptions.value = await apiCall('getVillages')`). The component must not ship with an empty `loadVillageOptions()`.

- [ ] **Step 4: Verify manually**

Run: dev server.
- Person with no home village → notice.
- Grant volunteer with two capabilities + one associate village → save → re-open shows them selected.
- Remove all capabilities (clear MultiSelect) → save → associate village remains (since PATCH sends both arrays, this is a full replace of both — confirm capabilities cleared, associate intact if left selected).
Expected: gating, grant, edit, revoke all work; selections round-trip.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/PersonList/components/VolunteerEdit.vue
git commit -m "feat(client): VolunteerEdit page with capabilities and associate villages

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: PersonDetail hub — action buttons

**Files:**
- Modify: `client/src/features/PersonList/components/PersonDetail.vue`

**Interfaces:**
- Consumes: `deletePerson` (personApi), router named routes from Task 2.
- Produces: Edit / Member / Volunteer / Delete actions on the detail view.

- [ ] **Step 1: Add actions and delete handling**

Modify `client/src/features/PersonList/components/PersonDetail.vue`. Add to `<script setup>`:

```javascript
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import { deletePerson } from '../api/personApi.js'

const router = useRouter()
const toast = useToast()

function goEdit ()      { router.push({ name: 'meta-person-edit',      params: { personId: personId.value } }) }
function goMember ()    { router.push({ name: 'meta-person-member',    params: { personId: personId.value } }) }
function goVolunteer () { router.push({ name: 'meta-person-volunteer', params: { personId: personId.value } }) }

async function removePerson () {
  if (!confirm('Delete this person? This cannot be undone.')) return
  try {
    await deletePerson(personId.value)
    toast.add({ severity: 'success', summary: 'Deleted', detail: 'Person deleted', life: 2000 })
    router.push({ name: 'meta-persons' })
  }
  catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete person', life: 3000 })
  }
}
```

In the `<template>`, above the `PersonDetailCard`, add an actions bar:

```vue
    <div class="actions" style="display:flex;gap:0.5rem;margin-bottom:1rem;">
      <Button label="Edit Person" icon="pi pi-pencil" @click="goEdit" />
      <Button label="Member" icon="pi pi-id-card" severity="secondary" @click="goMember" />
      <Button label="Volunteer" icon="pi pi-users" severity="secondary" @click="goVolunteer" />
      <Button label="Delete" icon="pi pi-trash" severity="danger" @click="removePerson" />
    </div>
```

- [ ] **Step 2: Verify manually**

Run: dev server. Open a person detail.
- Edit → opens PersonEditForm prefilled.
- Member / Volunteer → open the respective role pages.
- Delete → confirms, deletes, returns to list.
Expected: all four actions navigate/behave correctly.

- [ ] **Step 3: Commit**

```bash
git add client/src/features/PersonList/components/PersonDetail.vue
git commit -m "feat(client): person detail hub with edit/role/delete actions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Repoint Member/Volunteer lists to getPersons?role=

**Files:**
- Modify: `client/src/features/MemberList/api/memberApi.js`
- Modify: `client/src/features/MemberList/components/MemberList.vue`
- Modify: `client/src/features/VolunteerList/api/volunteerApi.js`
- Modify: `client/src/features/VolunteerList/components/VolunteerList.vue`

**Interfaces:**
- Consumes: `getPersons` (personApi) with `{ villageId, role }`.
- Produces: list data sourced from `/persons?villageId=&role=` instead of the removed village-scoped endpoints.

> Context: Plan A removes `getVillageMembers`/`getVillageVolunteers`. This task repoints the lists so they keep working. If Plan A's Task 9 Step 5 (endpoint removal) was deferred, do it now as the first action here, then complete this task in the same session so the client is never broken.

- [ ] **Step 1: Repoint `memberApi.js`**

Replace `client/src/features/MemberList/api/memberApi.js`:

```javascript
import { getPersons } from '../../PersonList/api/personApi.js'

export const getVillageMembers = (villageId) =>
  getPersons({ villageId: [villageId], role: 'member' })
```

Note: `getPersons` expects `villageId` as an array (it checks `villageId?.length`). Wrap the single id.

- [ ] **Step 2: Adapt MemberList data shape if needed**

`getPersons` returns `PersonSummary` (`personId`, `fullName`, `village`, `roles`, `phone`, `email`) — not the member-specific fields (`memberNumber`, etc.). Inspect `MemberList.vue` columns:

Run: `grep -nE "field=|memberNumber|memberLevel|joinDate|fullName|personId" client/src/features/MemberList/components/MemberList.vue`

For any column referencing member-only fields not present in `PersonSummary`, either remove the column or switch the list to show person-level fields. Keep the change minimal: a member LIST showing name + contact + village is sufficient; detailed member attributes live on the detail/edit pages. Update column `field` bindings accordingly.

- [ ] **Step 3: Repoint `volunteerApi.js`**

Replace `client/src/features/VolunteerList/api/volunteerApi.js`:

```javascript
import { getPersons } from '../../PersonList/api/personApi.js'

export const getVillageVolunteers = (villageId) =>
  getPersons({ villageId: [villageId], role: 'volunteer' })
```

- [ ] **Step 4: Adapt VolunteerList data shape if needed**

Same as Step 2 for `VolunteerList.vue` (`capabilities` is volunteer-only and not in `PersonSummary`). Remove or repoint such columns.

Run: `grep -nE "field=|capabilities|fullName|personId" client/src/features/VolunteerList/components/VolunteerList.vue`

- [ ] **Step 5: Check other consumers of the removed endpoints**

Run: `grep -rnE "getVillageMembers|getVillageVolunteers|getVillagePersons" client/src --include=*.js --include=*.vue`
Repoint any remaining callers (e.g. `features/VillageList/api/villageApi.js`) to `getPersons` with the appropriate role, or remove if dead.

- [ ] **Step 6: Verify manually**

Run: dev server. Navigate to a village's Members and Volunteers lists.
Expected: both load via `/persons?role=`, show the persons, and navigating to a detail still works.

- [ ] **Step 7: Commit**

```bash
git add client/src/features/MemberList client/src/features/VolunteerList \
        client/src/features/VillageList/api/villageApi.js
git commit -m "refactor(client): source member/volunteer lists from getPersons role filter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Add "New Person" entry point and full verification

**Files:**
- Modify: `client/src/features/PersonList/components/PersonList.vue`

- [ ] **Step 1: Add a "+ New Person" button**

In `PersonList.vue`, add a button near the list header that routes to create:

```vue
<Button label="New Person" icon="pi pi-plus" @click="$router.push({ name: 'meta-person-create' })" />
```
(Import `Button` from `primevue/button` if not already imported.)

- [ ] **Step 2: Run the spec's client verification (Section 5, item 7)**

With the API running (Plan A complete) and dev server up:
- Each edit page saves via exactly one role endpoint (observe Network tab: MemberEdit → one `/member` call; VolunteerEdit → one `/volunteer` call).
- Person form handles core + community (one `/persons` call + at most one `/communities` call).
- Delete works.
- Home-village gating shows the notice when the person has no home village.

Expected: all client verification items pass.

- [ ] **Step 3: Commit**

```bash
git add client/src/features/PersonList/components/PersonList.vue
git commit -m "feat(client): New Person entry point

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** Section 4 (client split UI) → Tasks 3–6; community checkboxes → Task 3; home-village gating → Tasks 4–5; list repointing (Section 2 removal) → Task 7; New Person entry → Task 8. ✅
- **Dependency:** explicitly gated on Plan A; Task 7 carries the coordination note for the endpoint-removal handoff. ✅
- **Type consistency:** operationIds used in `personApi.js`/`roleApi.js` (Task 1) match those produced by Plan A Task 9. `getPersons` array-`villageId` contract honored in Task 7. `volunteerInfo.associateVillages`/`capabilities` shapes match Plan A PersonService projections. ✅
- **Open items requiring confirmation during execution (flagged inline, not placeholders):** villages source (Task 3 Step 1), community name→id source (Task 3 Step 2), capability list source (Task 5 Step 1). Each step instructs the implementer to confirm the existing operationId and, if a lookup endpoint is genuinely missing, coordinate a small Plan A addition before proceeding — rather than inventing one. ✅
- **Placeholder scan:** component code is complete and runnable; the only deliberately-deferred bits are the three data-source wirings above, each with an explicit resolution instruction and a "must not ship empty" gate. ✅
