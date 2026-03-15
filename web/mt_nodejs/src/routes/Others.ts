import { Router, Request, Response, NextFunction } from 'express';
import {getQuote, getSymbols} from '../services/SocketBridgeApi';

const router = Router();

/**
 * @swagger
 * /quote:
 *   get:
 *     summary: Get quote info
 *     parameters:
 *       - in: query
 *         name: symbol
 *         schema:
 *           type: string
 *         required: true
 *         description: Symbol to get quote for
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/quote', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { symbol } = req.query;

        const quote = await getQuote(symbol as string);

        res.json(quote);
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /symbols:
 *   get:
 *     summary: Get available symbols/instruments
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/symbol/list', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const symbols = await getSymbols();
        res.json(symbols);
    } catch (error) {
        next(error);
    }
});


export default router;
