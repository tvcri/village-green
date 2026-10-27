<script setup>
// Drop reasons admin. Member is the only list today, so the page renders it
// like Positions and Trainings; when the Volunteer list arrives, wrap the two
// in Tabs (Member, Volunteer).
import CatalogAdmin from './CatalogAdmin.vue'
</script>
<template><CatalogAdmin kind="memberDropReason" /></template>
