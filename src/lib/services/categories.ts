import { prisma } from "@/lib/prisma";

export async function listCategories() {
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  return categories;
}
