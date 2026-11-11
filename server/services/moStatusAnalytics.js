import prisma from '../lib/prisma.js'

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000 // Pecko operates in Singapore time.

export async function logMoImport({ userId, username, filename, workOrderLines = 0, moCount = 0, success, error }) {
  await prisma.moStatusLog.create({
    data: { userId: userId || null, username: username || 'Unknown', filename, workOrderLines, moCount, success, error: error || null },
  })
}

function startOfTodaySGT() {
  const sgt = new Date(Date.now() + SGT_OFFSET_MS)
  const midnightSgtAsUtc = Date.UTC(sgt.getUTCFullYear(), sgt.getUTCMonth(), sgt.getUTCDate())
  return new Date(midnightSgtAsUtc - SGT_OFFSET_MS)
}

export async function getMoStats() {
  const today = startOfTodaySGT()
  const [importsToday, importsTotal, failedTotal, todayUsers, totals, byUser, recent] = await Promise.all([
    prisma.moStatusLog.count({ where: { createdAt: { gte: today } } }),
    prisma.moStatusLog.count(),
    prisma.moStatusLog.count({ where: { success: false } }),
    prisma.moStatusLog.findMany({ where: { createdAt: { gte: today } }, distinct: ['username'], select: { username: true } }),
    prisma.moStatusLog.aggregate({ _sum: { moCount: true, workOrderLines: true } }),
    prisma.moStatusLog.groupBy({
      by: ['username'],
      _count: { _all: true },
      _sum: { moCount: true },
      _max: { createdAt: true },
      orderBy: { _count: { username: 'desc' } },
    }),
    prisma.moStatusLog.findMany({
      orderBy: { createdAt: 'desc' }, take: 50,
      select: { id: true, username: true, filename: true, workOrderLines: true, moCount: true, success: true, error: true, createdAt: true },
    }),
  ])
  return {
    importsToday,
    usersToday: todayUsers.length,
    importsTotal,
    failedTotal,
    totalUsers: byUser.length,
    mosProcessed: totals._sum.moCount || 0,
    linesProcessed: totals._sum.workOrderLines || 0,
    users: byUser.map(u => ({ username: u.username, imports: u._count._all, mos: u._sum.moCount || 0, lastUsed: u._max.createdAt })),
    recent,
  }
}
