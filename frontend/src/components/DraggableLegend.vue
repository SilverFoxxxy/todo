<script setup>
import { computed } from 'vue';
import { useTodoStore } from '../composables/useTodoStore';
import draggable from 'vuedraggable';

const store = useTodoStore();

// Прокси для v-model (ref внутри store)
const localStatusOrder = computed({
  get: () => store.statusOrder.value,
  set: val => {
    store.statusOrder.value = val;
  },
});

// Цвета (такие же, как везде)
function getStatusColor(status) {
  const map = {
    Planned: '#3498db',
    Postponed: '#f39c12',
    Done: '#2ecc71',
    Cancelled: '#e74c3c',
    'Caught Up': '#9b59b6',
  };
  return map[status] || '#ccc';
}
</script>

<template>
  <div class="custom-legend">
    <draggable
      v-model="localStatusOrder"
      item-key="value"
      class="legend-list"
      ghost-class="legend-ghost"
    >
      <template #item="{ element }">
        <div class="legend-item">
          <span
            class="legend-color"
            :style="{ background: getStatusColor(element) }"
          ></span>
          <span class="legend-label">{{ element }}</span>
        </div>
      </template>
    </draggable>
    <div class="legend-hint">Перетащите, чтобы изменить порядок слоёв</div>
  </div>
</template>

<style scoped>
.custom-legend {
  margin-top: 12px;
}
.legend-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f0f0f0;
  padding: 4px 12px;
  border-radius: 20px;
  cursor: grab;
  user-select: none;
}
.legend-item:active {
  cursor: grabbing;
}
.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  display: inline-block;
}
.legend-label {
  font-size: 0.85rem;
  color: #333;
}
.legend-hint {
  font-size: 0.75rem;
  color: #888;
  margin-top: 8px;
}
.legend-ghost {
  opacity: 0.5;
  background: #e0e0e0;
}
</style>
