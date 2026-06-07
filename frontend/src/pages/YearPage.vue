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
import DraggableLegend from '../components/DraggableLegend.vue';

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
const year = ref(new Date().getFullYear());

function prevYear() {
  year.value--;
}
function nextYear() {
  year.value++;
}

function getWeekKey(year, week) {
  return `todo-week-${year}-W${String(week).padStart(2, '0')}`;
}
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}
function toDateStr(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const yearData = computed(() => {
  const data = {};
  for (let week = 1; week <= 53; week++) {
    const key = getWeekKey(year.value, week);
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const weekObj = JSON.parse(raw);
        Object.entries(weekObj).forEach(([dateStr, todos]) => {
          const y = parseInt(dateStr.slice(0, 4));
          if (y === year.value) data[dateStr] = todos;
        });
      } catch (e) {}
    }
  }
  return data;
});

const monthsData = computed(() => {
  const months = [];
  const monthNames = [
    'Январь',
    'Февраль',
    'Март',
    'Апрель',
    'Май',
    'Июнь',
    'Июль',
    'Август',
    'Сентябрь',
    'Октябрь',
    'Ноябрь',
    'Декабрь',
  ];
  for (let month = 1; month <= 12; month++) {
    const daysCount = daysInMonth(year.value, month);
    const labels = Array.from({ length: daysCount }, (_, i) => i + 1);
    const counts = {};
    store.STATUSES.forEach(s => {
      counts[s] = new Array(daysCount).fill(0);
    });

    for (let day = 1; day <= daysCount; day++) {
      const dateStr = toDateStr(year.value, month, day);
      const todos = yearData.value[dateStr] || [];
      todos.forEach(todo => {
        if (counts[todo.status]) counts[todo.status][day - 1]++;
      });
    }

    const datasets = store.statusOrder.value.map((status, idx) => ({
      label: status,
      data: counts[status],
      fill: idx === 0 ? 'origin' : '-1',
      backgroundColor: `${getStatusColor(status)}40`,
      borderColor: getStatusColor(status),
      pointBackgroundColor: getStatusColor(status),
      tension: 0.0,
      stack: 'year',
    }));

    months.push({
      month,
      title: monthNames[month - 1],
      chartData: { labels, datasets },
    });
  }
  return months;
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
  elements: {
    // ← добавляем
    point: {
      radius: 0, // точки скрыты
    },
  },
  scales: {
    y: {
      stacked: true,
      beginAtZero: true,
      ticks: { stepSize: 1, font: { size: 0 } },
    },
    x: { ticks: { font: { size: 0 } } },
  },
  plugins: {
    filler: { propagate: false },
    legend: { display: false },
  },
  interaction: { mode: 'index', intersect: false },
};
</script>

<template>
  <div class="year-page">
    <div class="year-controls">
      <button
        @click="prevYear"
        class="nav-btn"
      >
        ←
      </button>
      <span class="year-label">{{ year }}</span>
      <button
        @click="nextYear"
        class="nav-btn"
      >
        →
      </button>
    </div>

    <DraggableLegend />

    <div
      v-for="month in monthsData"
      :key="month.month"
      class="month-chart-wrapper"
    >
      <div class="chart-title-overlay">{{ month.title }}</div>
      <div class="chart-box">
        <Line
          :data="month.chartData"
          :options="chartOptions"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.year-page {
  max-width: 900px;
  margin: 0 auto;
}
.year-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-bottom: 12px;
}
.nav-btn {
  background: #4a90d9;
  color: #fff;
  border: none;
  font-size: 1.2rem;
  padding: 4px 16px;
  border-radius: 6px;
  cursor: pointer;
}
.year-label {
  font-size: 1.5rem;
  font-weight: 700;
}
.month-chart-wrapper {
  position: relative;
  margin-bottom: 20px;
  background: #fff;
  border-radius: 8px;
  padding: 12px 8px 8px 8px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}
.chart-title-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 2.8rem;
  font-weight: 800;
  color: #333;
  opacity: 0.15;
  pointer-events: none;
  white-space: nowrap;
  user-select: none;
  z-index: 1;
}
.chart-box {
  position: relative;
  height: 150px;
  z-index: 2;
}

@media (max-width: 600px) {
  .chart-title-overlay {
    font-size: 1.8rem;
  }
  .chart-box {
    position: relative;
    height: 100px;
    z-index: 2;
  }
}
</style>
