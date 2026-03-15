import { Router, Request, Response, NextFunction } from 'express';
import alertService from '../../services/alertService';

const router = Router();

router.post('/alerts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body;
    if (!body.symbol || typeof body.target_price !== 'number' || !body.direction) {
      res.status(400).json({ error: 'Missing required fields: symbol, target_price, direction' });
      return;
    }

    const created = await alertService.createAlert({
      symbol: body.symbol,
      target_price: body.target_price,
      direction: body.direction,
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.get('/alerts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const active = req.query.active === '1' || req.query.active === 'true';
    const list = await alertService.listAlerts(active);
    res.json(list);
  } catch (err) {
    next(err);
  }
});

router.get('/alerts/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const a = await alertService.getAlert(id);
    if (!a) return res.status(404).json({ error: 'Not found' });
    res.json(a);
  } catch (err) {
    next(err);
  }
});

router.delete('/alerts/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const ok = await alertService.deleteAlert(id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
