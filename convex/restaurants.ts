import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get cached restaurants for a zip code
 */
export const getCachedRestaurants = query({
  args: { zipCode: v.string() },
  handler: async (ctx, args) => {
    // Find the most recent search for this zip code
    const zipCodeSearch = await ctx.db
      .query("zipCodeSearches")
      .withIndex("by_zipCode", (q) => q.eq("zipCode", args.zipCode))
      .order("desc")
      .first();

    if (!zipCodeSearch) {
      return null;
    }

    // Get all restaurants for this search
    const restaurants = await ctx.db
      .query("restaurants")
      .withIndex("by_zipCodeSearch", (q) =>
        q.eq("zipCodeSearchId", zipCodeSearch._id)
      )
      .collect();

    return {
      zipCodeSearch,
      restaurants: restaurants.map((r) => ({
        name: r.name,
        genre: r.genre,
        priceLevel: r.priceLevel,
        isOpen: r.isOpen,
      })),
    };
  },
});

/**
 * Save restaurants for a zip code search
 */
export const saveRestaurants = mutation({
  args: {
    zipCode: v.string(),
    restaurants: v.array(
      v.object({
        name: v.string(),
        genre: v.string(),
        priceLevel: v.optional(v.number()),
        isOpen: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Create a new zip code search record
    const zipCodeSearchId = await ctx.db.insert("zipCodeSearches", {
      zipCode: args.zipCode,
      searchedAt: Date.now(),
    });

    // Save all restaurants
    for (const restaurant of args.restaurants) {
      await ctx.db.insert("restaurants", {
        zipCodeSearchId,
        name: restaurant.name,
        genre: restaurant.genre,
        priceLevel: restaurant.priceLevel,
        isOpen: restaurant.isOpen,
      });
    }

    return zipCodeSearchId;
  },
});
