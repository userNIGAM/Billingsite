import { Router } from 'express';
import { csrfProtection } from '../middleware/csrf';
import { requireAuth } from '../middleware/auth';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import khataRoutes from './khata.routes';
import bossRoutes from './boss.routes';
import officeRoutes from './office.routes';
import staffRoutes from './staff.routes';
import itemRoutes from './item.routes';
import customerRoutes from './customer.routes';
import consumptionRoutes from './consumption.routes';
import billRoutes from './bill.routes';
import paymentRoutes from './payment.routes';
import expenseRoutes from './expense.routes';
import expenseCategoryRoutes from './expenseCategory.routes';
import dashboardRoutes from './dashboard.routes';
import reportRoutes from './report.routes';
import settingsRoutes from './settings.routes';
import auditLogRoutes from './auditLog.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);

// Every protected resource lives behind both CSRF + auth. Mounting them per
// prefix (not router-wide) keeps unknown routes falling through to the 404
// handler instead of being swallowed by requireAuth.
router.use('/khatas', csrfProtection, requireAuth, khataRoutes);
router.use('/bosses', csrfProtection, requireAuth, bossRoutes);
router.use('/offices', csrfProtection, requireAuth, officeRoutes);
router.use('/staff', csrfProtection, requireAuth, staffRoutes);
router.use('/items', csrfProtection, requireAuth, itemRoutes);
router.use('/customers', csrfProtection, requireAuth, customerRoutes);
router.use('/consumption', csrfProtection, requireAuth, consumptionRoutes);
router.use('/bills', csrfProtection, requireAuth, billRoutes);
router.use('/payments', csrfProtection, requireAuth, paymentRoutes);
router.use('/expenses', csrfProtection, requireAuth, expenseRoutes);
router.use('/expense-categories', csrfProtection, requireAuth, expenseCategoryRoutes);
router.use('/dashboard', csrfProtection, requireAuth, dashboardRoutes);
router.use('/reports', csrfProtection, requireAuth, reportRoutes);
router.use('/settings', csrfProtection, requireAuth, settingsRoutes);
router.use('/audit-logs', csrfProtection, requireAuth, auditLogRoutes);

export default router;