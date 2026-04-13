import { defineLiveCollection } from "astro:content";
import { Loader } from "@/lib/Loader";

const data = defineLiveCollection({
  loader: Loader(),
});

export const collections = { data };
