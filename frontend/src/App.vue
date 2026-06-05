<script setup>
import WeekView from './components/WeekView.vue';
import WeekStats from './components/WeekStats.vue';
</script>

<template>
  <div class="app">
    <h1>Weekly To‑Do</h1>
    <WeekView />
    <WeekStats />
  </div>
</template>

<style>
body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  margin: 0;
  padding: 20px;
  background: #f5f5f5;
}
.app {
  /* max-width: 1200px; */
  margin: 0 auto;
}
h1 {
  text-align: center;
  color: #333;
}
</style>
