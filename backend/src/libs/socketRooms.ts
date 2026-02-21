export const getCompanyRoom = (companyId: number): string => {
  return `company-${companyId}`;
};

export const getCompanyTicketRoom = (
  companyId: number,
  ticketId: string | number
): string => {
  return `${getCompanyRoom(companyId)}-ticket-${ticketId}`;
};

export const getCompanyStatusRoom = (
  companyId: number,
  status: string
): string => {
  return `${getCompanyRoom(companyId)}-tickets-${status}`;
};

export const getCompanyNotificationRoom = (companyId: number): string => {
  return `${getCompanyRoom(companyId)}-notification`;
};

