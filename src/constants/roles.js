/**
 * Система ролей та дозволів для платформи торгівлі агротехнікою
 * Використовується для авторизації та контролю доступу
 */

const ROLES = {
    BUYER: {
      key: 'buyer',
      label: 'Покупець',
      permissions: {
        equipment: ['read', 'search', 'favorite'],
        messages: ['create', 'read'],
        reviews: ['create'],
        profile: ['read', 'update'],
      }
    },
    SELLER: {
      key: 'seller',
      label: 'Продавець',
      permissions: {
        equipment: ['create', 'read', 'update', 'delete', 'manage'],
        messages: ['create', 'read', 'manage'],
        reviews: ['read', 'respond'],
        profile: ['read', 'update', 'verify'],
        payments: ['withdraw'],
      }
    },
    ADMIN: {
      key: 'admin',
      label: 'Адміністратор',
      permissions: {
        equipment: ['read', 'delete', 'approve', 'feature'],
        users: ['read', 'update', 'ban', 'delete'],
        categories: ['create', 'read', 'update', 'delete'],
        messages: ['read', 'delete'],
        reviews: ['read', 'delete'],
        platform: ['configure'],
      }
    },
    VERIFIED_SELLER: {
      key: 'verified_seller',
      label: 'Верифікований продавець',
      inherits: 'seller',
      permissions: {
        equipment: ['feature'],
        profile: ['badge'],
      }
    }
  };
  
  // Допоміжні функції для роботи з ролями
  const RoleManager = {
    /**
     * Перевіряє, чи має роль вказаний дозвіл
     * @param {string} roleKey - Ключ ролі
     * @param {string} resource - Ресурс (equipment, users тощо)
     * @param {string} permission - Дія (create, read, update, delete)
     * @returns {boolean}
     */
    hasPermission: (roleKey, resource, permission) => {
      const role = ROLES[roleKey.toUpperCase()];
      if (!role) return false;
  
      // Перевірка успадкованих дозволів
      if (role.inherits) {
        const hasInherited = RoleManager.hasPermission(role.inherits, resource, permission);
        if (hasInherited) return true;
      }
  
      return role.permissions[resource]?.includes(permission) || false;
    },
  
    /**
     * Отримує всі дозволи для ролі
     * @param {string} roleKey - Ключ ролі
     * @returns {object}
     */
    getPermissions: (roleKey) => {
      const role = ROLES[roleKey.toUpperCase()];
      if (!role) return {};
  
      const permissions = {...role.permissions};
  
      // Додавання успадкованих дозволів
      if (role.inherits) {
        const inherited = RoleManager.getPermissions(role.inherits);
        for (const [resource, perms] of Object.entries(inherited)) {
          permissions[resource] = [...new Set([...(permissions[resource] || []), ...perms])];
        }
      }
  
      return permissions;
    },
  
    /**
     * Перевіряє, чи є роль валідною
     * @param {string} roleKey - Ключ ролі
     * @returns {boolean}
     */
    isValidRole: (roleKey) => {
      return Object.values(ROLES).some(role => role.key === roleKey);
    },
  
    /**
     * Отримує всі доступні ролі
     * @returns {array} Масив об'єктів ролей
     */
    getAllRoles: () => {
      return Object.values(ROLES).map(({key, label}) => ({key, label}));
    }
  };
  
  // Експорт констант і менеджера ролей
  export {
    ROLES,
    RoleManager
  };
  
  // Додаткові допоміжні експорти для зручності
  export const USER_ROLES = Object.freeze({
    BUYER: 'buyer',
    SELLER: 'seller',
    ADMIN: 'admin',
    VERIFIED_SELLER: 'verified_seller'
  });
  
  export const PERMISSIONS = Object.freeze({
    CREATE: 'create',
    READ: 'read',
    UPDATE: 'update',
    DELETE: 'delete',
    MANAGE: 'manage',
    APPROVE: 'approve',
    FEATURE: 'feature',
    BAN: 'ban',
    RESPOND: 'respond',
    WITHDRAW: 'withdraw',
    CONFIGURE: 'configure',
    VERIFY: 'verify',
    FAVORITE: 'favorite',
    SEARCH: 'search',
    BADGE: 'badge'
  });