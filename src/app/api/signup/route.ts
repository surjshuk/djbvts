import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';

import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const DEVELOPER_CODE = process.env.DEVELOPER_SIGNUP_CODE || 'DEV2025DJBVTS';

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, developerCode } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ message: 'email & password required' }, { status: 400 });
    }

    if (!developerCode) {
      return NextResponse.json({ message: 'Developer code is required' }, { status: 400 });
    }

    if (developerCode !== DEVELOPER_CODE) {
      return NextResponse.json({ message: 'Invalid developer code' }, { status: 403 });
    }

    const hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { email, password: hash, name } });
    return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
  } catch (e: any) {
    if (e.code === 'P2002') {
      return NextResponse.json({ message: 'Email already exists' }, { status: 409 });
    }
    return NextResponse.json({ message: 'Signup failed' }, { status: 500 });
  }
}
