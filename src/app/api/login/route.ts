import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import bcrypt from 'bcrypt';
import { signToken } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });

  const accessToken = signToken({ sub: user.id, role: user.role as 'USER' | 'ADMIN' });
  return NextResponse.json({ accessToken }, { status: 200 });
}
