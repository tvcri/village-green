<script setup>
// Drop reasons admin. Member is the only list today; the Volunteer list adds
// a second tab here.
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import CatalogAdmin from './CatalogAdmin.vue'
</script>

<template>
  <Tabs value="member">
    <TabList>
      <Tab value="member">Member</Tab>
    </TabList>
    <TabPanels>
      <TabPanel value="member">
        <CatalogAdmin kind="memberDropReason" />
      </TabPanel>
    </TabPanels>
  </Tabs>
</template>
