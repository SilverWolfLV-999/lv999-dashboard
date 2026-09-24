/* oxlint-disable no-console */
/**
 * Credits 管理员 CLI —— 能运行本脚本（持 DATABASE_URL）即视为管理员，无应用内角色判定。
 *
 * 用法：
 *   bun scripts/credit-admin.ts grant <userId> <amount> [--note "..."]   # 发放（upsert 账户 + balance+=amount + 流水）
 *   bun scripts/credit-admin.ts balance <userId>                          # 查询余额（无账户=0）
 *   bun scripts/credit-admin.ts set <userId> <amount> [--note "..."]      # 直接设定余额（写调整流水）
 *
 * 复用 features/credits/api/service（经 getDb()）；无参数/非法参数打印用法并 exit(1)。
 */
import { getBalance, grantCredits, setBalance } from '../src/features/credits/api/service';

function usage(): never {
  console.error(`用法：
  bun scripts/credit-admin.ts grant <userId> <amount> [--note "..."]
  bun scripts/credit-admin.ts balance <userId>
  bun scripts/credit-admin.ts set <userId> <amount> [--note "..."]`);
  process.exit(1);
}

/** 从剩余参数解析 --note 的值（shell 会把引号内的值作为单个 argv 传入） */
function parseNote(args: string[]): string | undefined {
  const index = args.indexOf('--note');
  return index >= 0 ? args[index + 1] : undefined;
}

const [command, userId, amountArg, ...rest] = process.argv.slice(2);
if (!command || !userId) usage();

if (command === 'balance') {
  const balance = await getBalance(userId);
  console.log(`${userId}: ${balance} credits`);
  process.exit(0);
}

if (command === 'grant' || command === 'set') {
  const amount = Number.parseInt(amountArg ?? '', 10);
  if (!Number.isFinite(amount)) {
    console.error('amount 必须是整数');
    usage();
  }
  const note = parseNote(rest);
  if (command === 'grant') {
    if (amount === 0) {
      console.error('grant 的 amount 不能为 0');
      usage();
    }
    const balance = await grantCredits({ userId, amount, note });
    console.log(`已发放 ${amount} credits 给 ${userId}；当前余额 = ${balance}`);
  } else {
    const balance = await setBalance({ userId, amount, note });
    console.log(`已设定 ${userId} 余额 = ${balance}`);
  }
  process.exit(0);
}

console.error(`未知命令：${command}`);
usage();
