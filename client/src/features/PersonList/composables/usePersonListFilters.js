import { ref, computed } from 'vue'
import { todayCivilDateIn } from '../../../shared/lib/civilDate.js'
import { PAUSE_TIME_ZONE } from '../../../shared/lib/volunteerPause.js'
import { rowTagKeys, matchesTags, selectionSentence, isEmailPaused } from '../lib/personTags.js'
import { parsePhoneObj } from '../lib/parsePhoneObj.js'

const ALL_VILLAGES = 'All villages'

// Case- and accent-insensitive, like the MySQL LIKE the server search used.
function fold (value) {
  return (value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

/**
 * Client-side filtering for the Hub persons list.
 * @param {import('vue').Ref<Array|null>} persons summary rows (null while loading)
 * @param {import('vue').Ref<Array|null>} villages village catalog
 * @param {import('vue').Ref<Array|null>} circles circle catalog [{circleId, name}]
 */
export function usePersonListFilters (persons, villages, circles) {
  const name = ref('')
  const phone = ref('')
  const email = ref('')
  const selectedVillage = ref(ALL_VILLAGES)
  const selectedTags = ref([])
  const matchMode = ref('any')
  const emailPausedOnly = ref(false)
  const veteranOnly = ref(false)
  const deceasedOnly = ref(false)

  const selectedVillageId = computed(() => {
    if (selectedVillage.value === ALL_VILLAGES) return undefined
    return (villages.value ?? []).find(v => v.name === selectedVillage.value)?.villageId
  })

  // Keys are strings: tag keys carry the id as text ('circle:1').
  const circleNameById = computed(() => {
    const map = new Map()
    for (const p of persons.value ?? []) {
      for (const c of p.circles ?? []) map.set(String(c.circleId), c.name)
    }
    for (const c of circles.value ?? []) map.set(String(c.circleId), c.name)
    return map
  })

  // Name matches word by word against fullName ("Last, First, Suffix"), so
  // "naomi brown", "brown, n" and "nao" all find "Brown, Naomi".
  const nameWords = computed(() => fold(name.value).split(/[\s,]+/).filter(Boolean))

  function matchesText (p) {
    if (selectedVillageId.value && p.village?.villageId !== selectedVillageId.value) return false
    if (nameWords.value.length) {
      const fullName = fold(p.fullName)
      if (!nameWords.value.every(w => fullName.includes(w))) return false
    }
    const phoneQuery = phone.value.trim()
    if (phoneQuery) {
      const { phone: ph, cell } = parsePhoneObj(p.phone)
      if (!(ph ?? '').includes(phoneQuery) && !(cell ?? '').includes(phoneQuery)) return false
    }
    const emailQuery = fold(email.value.trim())
    if (emailQuery && !fold(p.email).includes(emailQuery)) return false
    return true
  }

  const filteredPersons = computed(() => {
    if (!persons.value) return null
    const today = todayCivilDateIn(PAUSE_TIME_ZONE)
    return persons.value.filter(p =>
      matchesText(p) &&
      // The donor windows cut on the last gift date; today is always passed
      // because matchesTags throws for a window without it.
      matchesTags(rowTagKeys(p), selectedTags.value, matchMode.value,
        { lastGiftDate: p.donor?.lastGiftDate ?? null, today }) &&
      (!emailPausedOnly.value || isEmailPaused(p, today)) &&
      (!veteranOnly.value || p.isVeteran === true) &&
      (!deceasedOnly.value || p.deceased === true))
  })

  // Each text field, the village, each selected tag and each toggle counts one.
  // The match mode alone is not a filter.
  const activeFilterCount = computed(() =>
    (name.value.trim() ? 1 : 0) +
    (phone.value.trim() ? 1 : 0) +
    (email.value.trim() ? 1 : 0) +
    (selectedVillageId.value ? 1 : 0) +
    selectedTags.value.length +
    (emailPausedOnly.value ? 1 : 0) +
    (veteranOnly.value ? 1 : 0) +
    (deceasedOnly.value ? 1 : 0))
  const hasFilter = computed(() => activeFilterCount.value > 0)

  const sentence = computed(() =>
    selectionSentence(selectedTags.value, matchMode.value, circleNameById.value))

  function clearAll () {
    name.value = ''
    phone.value = ''
    email.value = ''
    selectedVillage.value = ALL_VILLAGES
    selectedTags.value = []
    matchMode.value = 'any'
    emailPausedOnly.value = false
    veteranOnly.value = false
    deceasedOnly.value = false
  }

  return {
    name, phone, email, selectedVillage, selectedVillageId, selectedTags, matchMode,
    emailPausedOnly, veteranOnly, deceasedOnly, filteredPersons, activeFilterCount, hasFilter,
    sentence, circleNameById, clearAll
  }
}
