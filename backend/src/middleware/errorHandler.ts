import type { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { logger } from '../lib/logger.js'

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

function zodFieldErrors(err: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? '_form')
    if (!fieldErrors[key]) fieldErrors[key] = []
    fieldErrors[key].push(issue.message)
  }
  return fieldErrors
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  try {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        ok: false,
        code: err.code,
        message: err.message,
      })
      return
    }

    if (err instanceof ZodError) {
      const issues = zodFieldErrors(err)
      const first = err.issues[0]?.message ?? 'Données invalides.'
      res.status(400).json({
        ok: false,
        code: 'VALIDATION_ERROR',
        message: first,
        issues,
      })
      return
    }

    logger.error({ err, path: req.path, method: req.method }, 'Unhandled error')

    res.status(500).json({
      ok: false,
      code: 'INTERNAL_ERROR',
      message: 'Erreur interne du serveur.',
    })
  } catch (nested) {
    logger.error({ nested, original: err }, 'errorHandler failed')
    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: 'Erreur interne du serveur.',
      })
    }
  }
}
