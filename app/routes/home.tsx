import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { searchRestaurantsByZip, type Restaurant } from "~/lib/restaurants";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Restaurant Finder" },
    {
      name: "description",
      content: "Find restaurants by zip code",
    },
  ];
}

export default function Home() {
  const [zipCode, setZipCode] = useState("37408");
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!zipCode.trim()) {
      setError("Please enter a zip code");
      return;
    }

    setLoading(true);
    setError(null);
    setRestaurants([]);

    try {
      const results = await searchRestaurantsByZip(zipCode.trim());
      setRestaurants(results);
      if (results.length === 0) {
        setError("No restaurants found for this zip code");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to search restaurants");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const getPriceLevel = (priceLevel?: number): string => {
    if (priceLevel === undefined || priceLevel === null) return "-";
    return "$".repeat(priceLevel) || "-";
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Restaurant Finder</h1>
          <p className="text-muted-foreground">
            Search for restaurants by zip code
          </p>
        </div>

        <div className="mb-8">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Enter zip code (e.g., 10001)"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1"
              disabled={loading}
            />
            <Button onClick={handleSearch} disabled={loading}>
              {loading ? "Searching..." : "Search"}
            </Button>
          </div>
          {error && (
            <p className="mt-2 text-sm text-destructive">{error}</p>
          )}
        </div>

        {restaurants.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              Found {restaurants.length} restaurant{restaurants.length !== 1 ? "s" : ""}
            </h2>
            <Table>
              <TableHeader>
                <TableRow className="h-8">
                  <TableHead className="h-8 px-2 text-xs font-medium">Name</TableHead>
                  <TableHead className="h-8 px-2 text-xs font-medium">Genre</TableHead>
                  <TableHead className="h-8 px-2 text-xs font-medium">Price</TableHead>
                  <TableHead className="h-8 px-2 text-xs font-medium">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {restaurants.map((restaurant, index) => (
                  <TableRow key={index} className="h-6">
                    <TableCell className="h-6 px-2 py-1 text-xs">
                      {restaurant.name}
                    </TableCell>
                    <TableCell className="h-6 px-2 py-1">
                      <Badge variant="secondary" className="text-xs py-0 px-1.5 h-4">
                        {restaurant.genre}
                      </Badge>
                    </TableCell>
                    <TableCell className="h-6 px-2 py-1 text-xs">
                      {getPriceLevel(restaurant.priceLevel)}
                    </TableCell>
                    <TableCell className="h-6 px-2 py-1 text-xs">
                      {restaurant.isOpen === undefined ? (
                        <span className="text-muted-foreground">-</span>
                      ) : restaurant.isOpen ? (
                        <Badge variant="default" className="text-xs py-0 px-1.5 h-4 bg-green-600">
                          Open
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs py-0 px-1.5 h-4">
                          Closed
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </div>
  );
}
