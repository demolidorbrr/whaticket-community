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

const rules = {
	user: {
		static: [],
	},

	admin: {
		static: adminLikePermissions,
	},

	superadmin: {
		static: adminLikePermissions,
	},
};

export default rules;
