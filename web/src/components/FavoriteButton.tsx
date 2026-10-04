import { useFavorites } from "../hooks/useFavorites";
import { Icon } from "./Icon";

export function FavoriteButton({ id }: { id: string }) {
  const { isFavorite, toggle } = useFavorites();
  const fav = isFavorite(id);
  return (
    <button
      type="button"
      className={`icon-btn ${fav ? "is-active" : ""}`}
      onClick={() => toggle(id)}
      aria-pressed={fav}
      title={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
    >
      <Icon name="star" filled={fav} />
      <span className="sr-only">{fav ? "Retirer des favoris" : "Ajouter aux favoris"}</span>
    </button>
  );
}
