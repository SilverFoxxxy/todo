<script setup>
import { ref, computed } from 'vue';
import { useTodoStore } from '../composables/useTodoStore';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import draggable from 'vuedraggable';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

const store = useTodoStore();

const localStatusOrder = computed({
  get: () => store.statusOrder.value,
  set: val => {
    store.statusOrder.value = val;
  },
});

const dayNames = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];

// Вычисление данных для графика с учётом порядка statusOrder
const chartData = computed(() => {
  const days = store.weekDays.value;
  const labels = days.map((_, i) => dayNames[i]);

  const counts = {};
  store.STATUSES.forEach(s => {
    counts[s] = new Array(7).fill(0);
  });

  days.forEach((dateStr, index) => {
    const todos = store.weekData.value[dateStr] || [];
    todos.forEach(todo => {
      if (counts[todo.status]) {
        counts[todo.status][index]++;
      }
    });
  });

  // Генерируем датасеты в порядке, заданном statusOrder
  const datasets = store.statusOrder.value.map((status, idx) => ({
    label: status,
    data: counts[status],
    fill: idx === 0 ? 'origin' : '-1',
    backgroundColor: `${getStatusColor(status)}40`,
    borderColor: getStatusColor(status),
    pointBackgroundColor: getStatusColor(status),
    tension: 0.0,
    stack: 'week',
  }));

  return { labels, datasets };
});

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

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    y: {
      stacked: true,
      beginAtZero: true,
      ticks: { stepSize: 1 },
    },
  },
  plugins: {
    filler: { propagate: false },
    legend: { display: false }, // скрываем стандартную легенду, у нас своя
  },
  interaction: {
    mode: 'index',
    intersect: false,
  },
};
</script>

<template>
  <div class="week-stats">
    <h3>Распределение задач по статусам</h3>
    <div class="chart-container">
      <Line
        :data="chartData"
        :options="chartOptions"
      />
    </div>

    <!-- Кастомная перетаскиваемая легенда -->
    <div class="custom-legend">
      <draggable
        v-model="localStatusOrder"
        item-key="status"
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
  </div>
</template>

<style scoped>
.week-stats {
  margin-top: 32px;
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
.week-stats h3 {
  margin: 0 0 12px 0;
  font-size: 1.1rem;
  color: #333;
}
.chart-container {
  position: relative;
  height: 260px;
  margin-bottom: 16px;
}

/* Кастомная легенда */
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
