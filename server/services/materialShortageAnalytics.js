import prisma from '../lib/prisma.js'

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000 // Pecko operates in Singapore time.

export async function logShortageRun({ userId, username, moFile, transferFile, moCount = 0, lineCount = 0, shortMos = 0, shortLines = 0, success, error }) {
  await prisma.materialShortageLog.create({
    data: {
      userId: userId || null, username: username || 'Unknown', moFile, transferFile,
      moCount, lineCount, shortMos, shortLines, success, error: error || null,
    },
  })
}

function startOfTodaySGT() {
  const sgt = new Date(Date.now() + SGT_OFFSET_MS)
  const midnightSgtAsUtc = Date.UTC(sgt.getUTCFullYear(), sgt.getUTCMonth(), sgt.getUTCDate())
  return new Date(midnightSgtAsUtc - SGT_OFFSET_MS)
}

export async function getShortageStats() {
  const today = startOfTodaySGT()
  const [runsToday, runsTotal, failedTotal, todayUsers, totals, byUser, recent] = await Promise.all([
    prisma.materialShortageLog.count({ where: { createdAt: { gte: today } } }),
    prisma.materialShortageLog.count(),
    prisma.materialShortageLog.count({ where: { success: false } }),
    prisma.materialShortageLog.findMany({ where: { createdAt: { gte: today } }, distinct: ['username'], select: { username: true } }),
    prisma.materialShortageLog.aggregate({ _sum: { moCount: true, lineCount: true } }),
    prisma.materialShortageLog.groupBy({
      by: ['username'],
      _count: { _all: true },
      _sum: { moCount: true },
      _max: { createdAt: true },
      orderBy: { _count: { username: 'desc' } },
    }),
    prisma.materialShortageLog.findMany({
      orderBy: { createdAt: 'desc' }, take: 50,
      select: { id: true, username: true, moFile: true, transferFile: true, moCount: true, lineCount: true, shortMos: true, shortLines: true, success: true, error: true, createdAt: true },
    }),
  ])
  return {
    runsToday,
    usersToday: todayUsers.length,
    runsTotal,
    failedTotal,
    totalUsers: byUser.length,
    mosProcessed: totals._sum.moCount || 0,
    linesProcessed: totals._sum.lineCount || 0,
    users: byUser.map(u => ({ username: u.username, runs: u._count._all, mos: u._sum.moCount || 0, lastUsed: u._max.createdAt })),
    recent,
  }
}
