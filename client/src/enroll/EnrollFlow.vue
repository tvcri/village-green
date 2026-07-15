<template>
  <div class="enroll-card">
    <h2>Volunteer account setup</h2>

    <template v-if="step === 'email'">
      <p>
        Enter the email address you have registered with The Village Common of RI
        and we'll send you a PIN to set up your Village Green account.
      </p>
      <form class="enroll-form" @submit.prevent="submitEmail">
        <label for="enroll-email">Email address</label>
        <InputText id="enroll-email" v-model="email" type="email" autocomplete="email" required />
        <Button type="submit" label="Send me a PIN" :loading="busy" />
      </form>
    </template>

    <template v-else-if="step === 'pin'">
      <Message severity="info" :closable="false">{{ requestMessage }}</Message>
      <p>Enter the 6-digit PIN from the email. It expires in 15 minutes.</p>
      <form class="enroll-form" @submit.prevent="submitPin">
        <label for="enroll-pin">PIN</label>
        <InputText id="enroll-pin" v-model="pin" inputmode="numeric" maxlength="6" required />
        <Button type="submit" label="Verify PIN" :loading="busy" :disabled="pin.length !== 6" />
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
      <code class="temp-password" data-testid="temp-password">{{ tempPassword }}</code>
      <p>
        <a :href="loginUrl" target="_blank" rel="noopener">Open the Village Green sign-in page in a new tab</a>
        and log in with your email address and this temporary password.
      </p>
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
const loginUrl = ref('/')

async function submitEmail() {
  error.value = ''
  busy.value = true
  try {
    const res = await requestPin(email.value)
    if (!res.ok) {
      error.value = 'Something went wrong. Please try again.'
      return
    }
    requestMessage.value = res.data.message || "If your email is registered as a volunteer, we've sent you instructions."
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
    loginUrl.value = res.data.loginUrl || '/'
    if (res.data.status === 'created') {
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
    loginUrl.value = res.data.loginUrl || '/'
    tempPassword.value = res.data.tempPassword
    step.value = 'password'
  }
  finally {
    busy.value = false
  }
}

function goToLogin() {
  window.open(loginUrl.value, '_blank', 'noopener')
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
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.enroll-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.enroll-choices {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: flex-start;
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
</style>
