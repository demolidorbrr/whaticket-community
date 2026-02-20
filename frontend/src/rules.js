const adminPermissions = [
  "drawer-admin-items:view",
  "tickets-manager:showall",
  "user-modal:editProfile",
  "user-modal:editQueues",
  "ticket-options:deleteTicket",
  "ticket-options:transferWhatsapp",
  "contacts-page:deleteContact"
];

const rules = {
  user: {
    static: [],
  },

  admin: {
    static: adminPermissions,
  },

  superadmin: {
    static: [...adminPermissions, "settings-page:view", "reseller-settings:view"],
  },
};

export default rules;

