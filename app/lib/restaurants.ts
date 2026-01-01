export interface Restaurant {
  name: string;
  genre: string;
  priceLevel?: number; // 0-4, where 0 is free and 4 is very expensive
  isOpen?: boolean; // Whether the restaurant is open right now
}

export interface SearchRestaurantsResponse {
  restaurants: Restaurant[];
  error?: string;
}

/**
 * Search for restaurants by zip code using Google Places API via Convex HTTP endpoint
 */
export async function searchRestaurantsByZip(
  zipCode: string
): Promise<Restaurant[]> {
  const convexSiteUrl = import.meta.env.VITE_CONVEX_SITE_URL;
  if (!convexSiteUrl) {
    throw new Error("VITE_CONVEX_SITE_URL is not configured");
  }

  const response = await fetch(`${convexSiteUrl}/api/restaurants`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ zipCode }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || "Failed to fetch restaurants");
  }

  const data: SearchRestaurantsResponse = await response.json();
  
  if (data.error) {
    throw new Error(data.error);
  }

  return data.restaurants || [];
}
