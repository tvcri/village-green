import { getVillages as getVillagesBase } from '../../VillageList/api/villageApi.js'

export const getVillages = () => {
  return getVillagesBase([])
}
