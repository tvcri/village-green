import { reactive } from 'vue'
import { getGenders, getEthnicities, getRaces, getContactMethods, getLanguages } from '../api/personApi.js'

// The 0027 person catalogs change only by migration, so one fetch serves every
// person form for the life of the page. All callers share one reactive object.
const lookups = reactive({
  genders: [], ethnicities: [], races: [], contactMethods: [], languages: [], loaded: false,
})
let pending = null

export function usePersonLookups () {
  if (!pending) {
    pending = Promise.all([getGenders(), getEthnicities(), getRaces(), getContactMethods(), getLanguages()])
      .then(([genders, ethnicities, races, contactMethods, languages]) => {
        Object.assign(lookups, { genders, ethnicities, races, contactMethods, languages, loaded: true })
      })
      .catch(err => {
        pending = null   // let the next caller retry
        throw err
      })
  }
  return { lookups, ready: pending }
}

export function _resetPersonLookups () {
  pending = null
  Object.assign(lookups, { genders: [], ethnicities: [], races: [], contactMethods: [], languages: [], loaded: false })
}
