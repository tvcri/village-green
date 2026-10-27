<script setup>
// Drop reasons admin: one catalog per role, Member and Volunteer tabs. Tabs
// is lazy so only the open tab loads its list.
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import CatalogAdmin from './CatalogAdmin.vue'
</script>

<template>
  <Tabs value="member" lazy class="drop-reasons-tabs">
    <TabList>
      <Tab value="member">Member</Tab>
      <Tab value="volunteer">Volunteer</Tab>
    </TabList>
    <TabPanels>
      <TabPanel value="member">
        <CatalogAdmin kind="memberDropReason" />
      </TabPanel>
      <TabPanel value="volunteer">
        <CatalogAdmin kind="volunteerDropReason" />
      </TabPanel>
    </TabPanels>
  </Tabs>
</template>

<style scoped>
/* TabPanels paints the theme's surface behind its content, which turned the
   catalog table into white-on-white. Let the page's grey show through so the
   table reads like Positions and Trainings. */
.drop-reasons-tabs :deep(.p-tabpanels),
.drop-reasons-tabs :deep(.p-tabs),
.drop-reasons-tabs :deep(.p-tablist-tab-list) {
  background: transparent;
}
</style>
