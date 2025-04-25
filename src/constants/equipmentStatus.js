/**
 * Система статусів для сільськогосподарської техніки
 * Включає перелік статусів, кольори для інтерфейсу та методи роботи з ними
 */

const EQUIPMENT_STATUSES = {
    AVAILABLE: {
      key: 'available',
      label: 'Доступно',
      color: '#4CAF50', // Зелений
      icon: 'check-circle',
      canBook: true,
      canEdit: true,
      nextStates: ['reserved', 'archived']
    },
    RESERVED: {
      key: 'reserved',
      label: 'Заброньовано',
      color: '#FFC107', // Жовтий
      icon: 'clock',
      canBook: false,
      canEdit: false,
      nextStates: ['sold', 'available']
    },
    SOLD: {
      key: 'sold',
      label: 'Продано',
      color: '#F44336', // Червоний
      icon: 'check',
      canBook: false,
      canEdit: false,
      nextStates: ['archived']
    },
    ARCHIVED: {
      key: 'archived',
      label: 'В архіві',
      color: '#9E9E9E', // Сірий
      icon: 'archive',
      canBook: false,
      canEdit: false,
      nextStates: ['available']
    },
    PENDING_REVIEW: {
      key: 'pending_review',
      label: 'На модерації',
      color: '#2196F3', // Синій
      icon: 'eye',
      canBook: false,
      canEdit: true,
      nextStates: ['available', 'rejected']
    },
    REJECTED: {
      key: 'rejected',
      label: 'Відхилено',
      color: '#607D8B', // Сіро-блакитний
      icon: 'x-circle',
      canBook: false,
      canEdit: true,
      nextStates: ['pending_review']
    }
  };
  
  // Допоміжні функції для роботи зі статусами
  const StatusManager = {
    /**
     * Отримати об'єкт статусу за ключем
     * @param {string} statusKey
     * @returns {object|null}
     */
    getStatus: (statusKey) => {
      return Object.values(EQUIPMENT_STATUSES).find(s => s.key === statusKey) || null;
    },
  
    /**
     * Перевірити, чи є перехід між статусами допустимим
     * @param {string} currentStatus
     * @param {string} newStatus
     * @returns {boolean}
     */
    isValidTransition: (currentStatus, newStatus) => {
      const status = StatusManager.getStatus(currentStatus);
      return status?.nextStates.includes(newStatus) || false;
    },
  
    /**
     * Отримати всі доступні статуси
     * @returns {array} Масив об'єктів {key, label}
     */
    getAllStatuses: () => {
      return Object.values(EQUIPMENT_STATUSES).map(({key, label}) => ({key, label}));
    },
  
    /**
     * Отримати статуси для вибору при редагуванні
     * @param {string} currentStatus
     * @returns {array} Масив доступних статусів
     */
    getAvailableTransitions: (currentStatus) => {
      const status = StatusManager.getStatus(currentStatus);
      if (!status) return [];
      return status.nextStates.map(StatusManager.getStatus).filter(Boolean);
    },
  
    /**
     * Перевірити, чи можна бронювати техніку з даним статусом
     * @param {string} statusKey
     * @returns {boolean}
     */
    isBookable: (statusKey) => {
      const status = StatusManager.getStatus(statusKey);
      return status?.canBook || false;
    },
  
    /**
     * Перевірити, чи можна редагувати техніку з даним статусом
     * @param {string} statusKey
     * @returns {boolean}
     */
    isEditable: (statusKey) => {
      const status = StatusManager.getStatus(statusKey);
      return status?.canEdit || false;
    }
  };
  
  // Експорт констант і менеджера статусів
  export {
    EQUIPMENT_STATUSES,
    StatusManager
  };
  
  // Додаткові експорти для зручності
  export const STATUS_KEYS = Object.freeze({
    AVAILABLE: 'available',
    RESERVED: 'reserved',
    SOLD: 'sold',
    ARCHIVED: 'archived',
    PENDING_REVIEW: 'pending_review',
    REJECTED: 'rejected'
  });
  
  export const STATUS_COLORS = Object.fromEntries(
    Object.values(EQUIPMENT_STATUSES).map(s => [s.key, s.color])
  );