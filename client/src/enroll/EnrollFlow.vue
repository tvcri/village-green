<template>
  <div class="enroll-card">
    <h2>Volunteer account setup</h2>

    <template v-if="step === 'email'">
      <p>
        Enter the email address you have registered with The Village Common of RI.
        We'll send you a PIN to set up your Village Green account.
      </p>
      <form class="enroll-form" @submit.prevent="submitEmail">
        <label class="enroll-label" for="enroll-email">Email address</label>
        <InputText id="enroll-email" v-model="email" type="email" autocomplete="email" required />
        <Button type="submit" label="Send me a PIN" :loading="busy" />
      </form>
    </template>

    <template v-else-if="step === 'pin'">
      <Message severity="info" :closable="false">{{ requestMessage }}</Message>
      <p>Enter the 6-digit PIN from the email. It expires in 15 minutes.</p>
      <form class="enroll-form" @submit.prevent="submitPin">
        <InputText id="enroll-pin" v-model="pin" class="pin-input" inputmode="numeric" maxlength="6" required aria-label="PIN" />
        <Button class="pin-submit" type="submit" label="Verify PIN" :loading="busy" :disabled="pin.length !== 6" />
      </form>
      <Button label="Start over" link @click="startOver" />
    </template>

    <template v-else-if="step === 'choice'">
      <p>You already have a Village Green account for {{ email }}.</p>
      <div class="enroll-choices">
        <Button label="Take me to sign in" @click="goToLogin" />
        <Button label="I need a new temporary password" severity="secondary" :loading="busy" @click="requestReset" />
      </div>
    </template>

    <template v-else-if="step === 'password'">
      <p>
        Here is your temporary password. It is shown only once &mdash; you'll be asked
        to choose your own password when you sign in.
      </p>
      <div class="temp-password-row">
        <code class="temp-password" data-testid="temp-password">{{ tempPassword }}</code>
        <Button
          :label="copied ? 'Copied' : 'Copy'"
          :icon="copied ? 'pi pi-check' : 'pi pi-copy'"
          severity="secondary"
          size="small"
          @click="copyTempPassword"
        />
      </div>
      <Button class="signin-button"label="Take me to sign in" @click="goToLogin" />
    </template>

    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { requestPin, verifyPin, resetPassword } from './enrollApi.js'

const step = ref('email')      // email | pin | choice | password
const email = ref('')
const pin = ref('')
const busy = ref(false)
const error = ref('')
const requestMessage = ref('')
const tempPassword = ref('')
const loginUrl = ref('./')
const copied = ref(false)

async function submitEmail() {
  error.value = ''
  busy.value = true
  try {
    const res = await requestPin(email.value)
    if (!res.ok) {
      error.value = 'Something went wrong. Please try again.'
      return
    }
    // Display-only acknowledgement, owned by the client. The API returns an
    // empty uniform 200 (enumeration defense) and no display text.
    requestMessage.value = "If your email is registered as a volunteer, we've sent you a PIN."
    step.value = 'pin'
  }
  finally {
    busy.value = false
  }
}

async function submitPin() {
  error.value = ''
  busy.value = true
  try {
    const res = await verifyPin(email.value, pin.value)
    if (!res.ok) {
      error.value = 'That PIN was not accepted. It may be wrong, expired, or already used. You can start over to request a new one.'
      return
    }
    loginUrl.value = res.data.loginUrl || './'
    if (res.data.status === 'created') {
      // Guard the contract: 'created' must carry a temp password. A blank one
      // would strand the user on a password screen showing an empty code box
      // and a Copy button that copies nothing — fail loudly instead.
      if (!res.data.tempPassword) {
        error.value = 'Your account was created, but we could not show a temporary password. Please start over and request a new PIN.'
        return
      }
      tempPassword.value = res.data.tempPassword
      step.value = 'password'
    }
    else {
      step.value = 'choice'
    }
  }
  finally {
    busy.value = false
  }
}

async function requestReset() {
  error.value = ''
  busy.value = true
  try {
    const res = await resetPassword(email.value, pin.value)
    if (!res.ok) {
      error.value = 'Could not issue a new temporary password. Please start over and request a new PIN.'
      return
    }
    if (!res.data.tempPassword) {
      error.value = 'Could not issue a new temporary password. Please start over and request a new PIN.'
      return
    }
    loginUrl.value = res.data.loginUrl || './'
    tempPassword.value = res.data.tempPassword
    step.value = 'password'
  }
  finally {
    busy.value = false
  }
}

async function copyTempPassword() {
  try {
    await navigator.clipboard.writeText(tempPassword.value)
    copied.value = true
  }
  catch {
    // Clipboard unavailable/denied: the password stays visible and selectable
    // (user-select: all), so the user can copy it manually.
    copied.value = false
  }
}

function goToLogin() {
  try {
    sessionStorage.setItem('vg-login-hint', email.value)
  }
  catch {
    // Storage unavailable (private mode / disabled): proceed without a hint.
  }
  window.location.assign(loginUrl.value)
}

function startOver() {
  step.value = 'email'
  pin.value = ''
  error.value = ''
  tempPassword.value = ''
}
</script>

<style scoped>
.enroll-card {
  width: 100%;
  max-width: 580px;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--color-background-light);
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  box-shadow: var(--box-shadow-card);
  padding: 2rem;
  text-align: center;
}

.enroll-form {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  max-width: 22rem;
}

.enroll-label {
  font-weight: 600;
}

.enroll-form :deep(.p-inputtext) {
  width: 100%;
}

/* Echo the 6-digit code as it appears in the email: narrow, centered, bold,
   and spaced out so it reads as a PIN rather than free text. */
.pin-input {
  width: 10rem;
  align-self: center;
  text-align: center;
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: 0.5rem;
  /* letter-spacing pushes the glyphs right; nudge back so they look centered */
  text-indent: 0.5rem;
}

/* Match the PIN input's width so the two read as a centered vertical pair
   rather than a stranded button. */
.pin-submit {
  align-self: center;
  width: 10rem;
}

.enroll-choices {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: center;
}

.temp-password-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  align-self: center;
}

.temp-password {
  font-size: 1.5rem;
  letter-spacing: 2px;
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border-default);
  border-radius: 6px;
  align-self: center;
  user-select: all;
}

.signin-button {
  margin-top: 1rem;
}
</style>
