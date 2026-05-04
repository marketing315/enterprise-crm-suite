import { createTableViewsHooks } from "./useEntityTableViews";

const hooks = createTableViewsHooks("ticket_table_views", "ticket-table-views");

export const useTicketTableViews = hooks.useViews;
export const useCreateTicketTableView = hooks.useCreate;
export const useUpdateTicketTableView = hooks.useUpdate;
export const useDeleteTicketTableView = hooks.useDelete;
