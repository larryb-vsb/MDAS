import { relations } from "drizzle-orm/relations";
import { users, auditLogs, securityLogs, merchants, transactions } from "./schema";

export const auditLogsRelations = relations(auditLogs, ({one}) => ({
	user: one(users, {
		fields: [auditLogs.userId],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	auditLogs: many(auditLogs),
	securityLogs: many(securityLogs),
}));

export const securityLogsRelations = relations(securityLogs, ({one}) => ({
	user: one(users, {
		fields: [securityLogs.userId],
		references: [users.id]
	}),
}));

export const transactionsRelations = relations(transactions, ({one}) => ({
	merchant: one(merchants, {
		fields: [transactions.merchantId],
		references: [merchants.id]
	}),
}));

export const merchantsRelations = relations(merchants, ({many}) => ({
	transactions: many(transactions),
}));