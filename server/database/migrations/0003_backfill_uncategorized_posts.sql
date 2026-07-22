UPDATE `posts`
SET `category_id` = 'cat-uncategorized'
WHERE `category_id` IS NULL;
