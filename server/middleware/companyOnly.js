import prisma from '../lib/prisma.js'

// Gate a route to a single company. Admins are cross-company and always allowed.
// Reads the user's current company from the DB so it reflects changes immediately
// and tolerates access tokens issued before the company field existed.
export function requireCompany(company) {
  return async (req, res, next) => {
    try {
      if (req.user?.role === 'ADMIN') return next()
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { company: true },
      })
      if (user?.company === company) return next()
      return res.status(403).json({ error: 'Not authorized for this company feature' })
    } catch (err) { next(err) }
  }
}
