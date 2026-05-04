import { createTableViewsHooks } from "./useEntityTableViews";

const hooks = createTableViewsHooks("deal_table_views", "deal-table-views");

export const useDealTableViews = hooks.useViews;
export const useCreateDealTableView = hooks.useCreate;
export const useUpdateDealTableView = hooks.useUpdate;
export const useDeleteDealTableView = hooks.useDelete;
