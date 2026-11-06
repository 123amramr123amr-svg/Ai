import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { prompt } = await req.json();
  const plan = `# Plan\n\nGoal: ${prompt}\n\nSteps:\n1. Clarify requirements\n2. Design solution\n3. Implement\n4. Test\n5. Review\n\nConstraints: security, performance, accessibility.`;
  return NextResponse.json({ plan });
}