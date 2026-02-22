// Perfis administrativos compartilham as mesmas permissoes visuais no frontend.
const adminLikePermissions = [
	"drawer-admin-items:view",
	"tickets-manager:showall",
	"user-modal:editProfile",
	"user-modal:editQueues",
	"ticket-options:deleteTicket",
	"ticket-options:transferWhatsapp",
	"contacts-page:deleteContact",
];

// Admin de tenant nao deve acessar configuracoes globais de revenda.
const adminPermissions = [...adminLikePermissions];

// Superadmin controla configuracoes globais, incluindo Empresas e Planos.
const superAdminPermissions = [...adminLikePermissions, "settings-page:view"];

const rules = {
	user: {
		static: [],
	},

	admin: {
		static: adminPermissions,
	},

	superadmin: {
		static: superAdminPermissions,
	},
};

export default rules;
