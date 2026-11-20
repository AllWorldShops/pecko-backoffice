import prisma from '../lib/prisma.js'

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000 // Pecko operates in Singapore time.

export async function logGrReport({ userId, username, receiptsFile, poLinesFile, lines = 0, priced = 0, totalUsd = 0, success, error }) {
  await prisma.grValueLog.create({
    data: {
      userId: userId || null, username: username || 'Unknown', receiptsFile, poLinesFile,
      lines, priced, totalUsd, success, error: error || null,
    },
  })
}

function startOfTodaySGT() {
  const sgt = new Date(Date.now() + SGT_OFFSET_MS)
  const midnightSgtAsUtc = Date.UTC(sgt.getUTCFullYear(), sgt.getUTCMonth(), sgt.getUTCDate())
  return new Date(midnightSgtAsUtc - SGT_OFFSET_MS)
}

export async function getGrStats() {
  const today = startOfTodaySGT()
  const [reportsToday, reportsTotal, failedTotal, todayUsers, totals, byUser, recent] = await Promise.all([
    prisma.grValueLog.count({ where: { createdAt: { gte: today } } }),
    prisma.grValueLog.count(),
    prisma.grValueLog.count({ where: { success: false } }),
    prisma.grValueLog.findMany({ where: { createdAt: { gte: today } }, distinct: ['username'], select: { username: true } }),
    prisma.grValueLog.aggregate({ _sum: { lines: true, priced: true } }),
    prisma.grValueLog.groupBy({
      by: ['username'],
      _count: { _all: true },
      _sum: { lines: true },
      _max: { createdAt: true },
      orderBy: { _count: { username: 'desc' } },
    }),
    prisma.grValueLog.findMany({
      orderBy: { createdAt: 'desc' }, take: 50,
      select: { id: true, username: true, receiptsFile: true, poLinesFile: true, lines: true, priced: true, totalUsd: true, success: true, error: true, createdAt: true },
    }),
  ])
  return {
    reportsToday,
    usersToday: todayUsers.length,
    reportsTotal,
    failedTotal,
    totalUsers: byUser.length,
    linesProcessed: totals._sum.lines || 0,
    linesPriced: totals._sum.priced || 0,
    users: byUser.map(u => ({ username: u.username, reports: u._count._all, lines: u._sum.lines || 0, lastUsed: u._max.createdAt })),
    recent,
  }
}
