const express = require("express");
const app = express();

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

app.use(express.json());

let db = null;
const dbPath = path.join(__dirname, "twitterClone.db");

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running...");
    });
  } catch (e) {
    console.log(`DB ERROR : ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

// API 1 - REGISTER USER
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;

  const selectQuery = `
    SELECT *
    FROM user 
    WHERE username = '${username}';`;

  let dbUser = await db.get(selectQuery);

  if (dbUser === undefined) {
    if (password.length >= 6) {
      const hashedPassword = await bcrypt.hash(password, 10);

      const registerQuery = `
            INSERT INTO 
                user(username, password, name, gender)
            VALUES 
                ('${username}', '${hashedPassword}', '${name}', '${gender}');`;

      await db.run(registerQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

// API 2 - LOGIN USER
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const selectQuery = `
    SELECT *
    FROM user 
    WHERE username = '${username}';`;

  const dbUser = await db.get(selectQuery);

  if (dbUser !== undefined) {
    const passwordCheck = await bcrypt.compare(password, dbUser.password);
    if (passwordCheck) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "my_secret_token");
      response.send({ jwtToken: jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

const authentiateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "my_secret_token", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

// API 3 - GET LATEST TWEETS OF OF PEOPLE WHOM USER FOLLOWS
app.get("/user/tweets/feed/", authentiateToken, async (request, response) => {
  const { username } = request;
  const selectQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}';`;

  const dbUser = await db.get(selectQuery);

  const userId = dbUser.user_id;

  /* ALTERNATIVE METHOD NOT IN USE FOR NOW
  const followingListQuery = `
  SELECT following_user_id
  FROM follower
  WHERE follower_user_id = ${userId};
  `;
  const followersList = await db.all(followingListQuery);

  console.log(followersList);

  const followersIds = followersList.map((eachItem) => {
    return eachItem.following_user_id;
  });
  console.log(followersIds);

  const getTweetsQuery = `
  SELECT 
    user.username, tweet.tweet, tweet.date_time AS dateTime
  FROM user
  INNER JOIN tweet
    ON user.user_id = tweet.user_id
  WHERE user.user_id IN (${followersIds})
  ORDER BY dateTime DESC
  LIMIT 4;`;

  const result = await db.all(getTweetsQuery);
  response.send(result);
*/

  const getTweetsQuery = `
  SELECT 
    user.username, tweet.tweet, tweet.date_time AS dateTime
  FROM 
    follower
  INNER JOIN tweet
    ON follower.following_user_id = tweet.user_id
  INNER JOIN user
    ON tweet.user_id = user.user_id
  WHERE 
    follower.follower_user_id = ${userId}
  ORDER BY 
    tweet.date_time DESC
  LIMIT 4;
  `;

  const tweetsList = await db.all(getTweetsQuery);
  response.send(tweetsList);
});

// API 4 NAMES LIST WHO THE USER FOLLOWS
app.get("/user/following/", authentiateToken, async (request, response) => {
  const { username } = request;

  const selectQuery = `
    SELECT * 
    FROM user
    WHERE username = '${username}';`;

  const dbUser = await db.get(selectQuery);
  const userId = dbUser.user_id;

  const followingQuery = `
    SELECT user.name
    FROM follower
    INNER JOIN user
        ON user.user_id = follower.following_user_id
    WHERE follower_user_id = ${userId};`;

  const followingNamesList = await db.all(followingQuery);
  console.log(followingNamesList);
  response.send(followingNamesList);
});

// API 5 - NAMES LIST WHO FOLLOW THE USER
app.get("/user/followers/", authentiateToken, async (request, response) => {
  const { username } = request;

  const selectUserQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}';`;

  const dbUser = await db.get(selectUserQuery);
  const userId = dbUser.user_id;

  // getting the names of the people who follow the user
  const getFollowersQuery = `
  SELECT user.name
  FROM follower
  INNER JOIN user 
    ON follower.follower_user_id = user.user_id
  WHERE follower.following_user_id = ${userId};`;

  const followerNamesList = await db.all(getFollowersQuery);
  response.send(followerNamesList);
});

// API 6 - USER REQUEST TWEET HE'S FOLLOWING, THEN GET TWEET DETAILS
app.get("/tweets/:tweetId/", authentiateToken, async (request, response) => {
  const { tweetId } = request.params;

  const { username } = request;
  const selectUserQuery = ` 
    SELECT * 
    FROM user 
    WHERE username = '${username}';`;

  const dbUser = await db.get(selectUserQuery);
  const userId = dbUser.user_id;

  const dbUserFollowingQuery = `
  SELECT tweet.tweet_id
  FROM follower 
  INNER JOIN tweet 
    ON follower.following_user_id = tweet.user_id
  WHERE follower.follower_user_id = ${userId};
  `;

  const dbUserFollowingTweetsList = await db.all(dbUserFollowingQuery);

  const tweetIdsList = dbUserFollowingTweetsList.map((eachItem) => {
    return eachItem.tweet_id;
  });

  if (tweetIdsList.includes(parseInt(tweetId))) {
    const tweetDetailsQuery = `
    SELECT 
        tweet.tweet, 
        COUNT(like.user_id) AS likes, 
        COUNT(reply.user_id) AS replies,
        tweet.date_time AS dateTime
    FROM 
        tweet
    INNER JOIN like
        ON tweet.tweet_id = like.tweet_id
    INNER JOIN reply 
        ON tweet.tweet_id = reply.tweet_id
    WHERE tweet.tweet_id = ${tweetId}; 
    `;

    const tweetDetails = await db.get(tweetDetailsQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }

  //console.log(tweetIdsList);
  //console.log(dbUserFollowingTweetsList);
});

// API 7 - USER REQUEST TWEET HE'S FOLLOWING, THEN GET TWEET LIKE NAMES
app.get(
  "/tweets/:tweetId/likes/",
  authentiateToken,
  async (request, response) => {
    const { tweetId } = request.params;

    const { username } = request;

    const selectQuery = `
    SELECT *
    FROM user 
    WHERE username = '${username}';`;

    const dbUser = await db.get(selectQuery);
    const userId = dbUser.user_id;

    const followingListQuery = `
    SELECT tweet.tweet_id
    FROM follower
    INNER JOIN tweet 
        ON tweet.user_id = follower.following_user_id
    WHERE follower_user_id = ${userId}`;

    const followingTweetsList = await db.all(followingListQuery);

    const tweetsList = followingTweetsList.map((eachItem) => {
      return eachItem.tweet_id;
    });

    if (tweetsList.includes(parseInt(tweetId))) {
      const likeNamesQuery = `
        SELECT username
        FROM like
        NATURAL JOIN user
        WHERE tweet_id = ${tweetId};`;

      const namesList = await db.all(likeNamesQuery);

      const onlyNamesList = namesList.map((eachItem) => {
        return eachItem.username;
      });

      response.send({ likes: onlyNamesList });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// API 8 - USER REQUEST TWEET HE'S FOLLOWING, THEN GET TWEET REPLIES
app.get(
  "/tweets/:tweetId/replies/",
  authentiateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    const selectQuery = `
    SELECT * 
    FROM user 
    WHERE username = '${username}';`;

    const dbUser = await db.get(selectQuery);
    const userId = dbUser.user_id;

    const followingListQuery = `
    SELECT tweet.tweet_id 
    FROM follower
    INNER JOIN tweet 
        ON tweet.user_id = follower.following_user_id
    WHERE follower.follower_user_id = ${userId};`;

    const followingTweetsList = await db.all(followingListQuery);

    const tweetsList = followingTweetsList.map((eachItem) => {
      return eachItem.tweet_id;
    });

    if (tweetsList.includes(parseInt(tweetId))) {
      const replyDetailsQuery = `
        SELECT name, reply
        FROM reply 
        NATURAL JOIN user
        WHERE tweet_id = ${tweetId};`;

      const replyDetails = await db.all(replyDetailsQuery);
      response.send({ replies: replyDetails });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }

    //console.log(followingTweetsList);
    // console.log(tweetsList);
  }
);

// API 9 - USER ALL TWEETS
app.get("/user/tweets/", authentiateToken, async (request, response) => {
  const { username } = request;

  const selectQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}';`;

  const dbUser = await db.get(selectQuery);
  const userId = dbUser.user_id;

  const getUserTweetsQuery = `
    SELECT 
        tweet.tweet, 
        COUNT(like.user_id) AS likes, 
        COUNT(reply.user_id) AS replies, 
        tweet.date_time AS dateTime
    FROM 
        tweet 
    INNER JOIN like
        ON tweet.tweet_id = like.tweet_id
    INNER JOIN reply
        ON tweet.tweet_id = reply.tweet_id
    WHERE 
        tweet.user_id = ${userId};
    `;

  const getUserTweets = await db.all(getUserTweetsQuery);
  response.send(getUserTweets);
});

// API 10 - CREATE TWEET IN THE TABLE
app.post("/user/tweets/", authentiateToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;

  const selectQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}';`;

  const dbUser = await db.get(selectQuery);
  const userId = dbUser.user_id;

  let currentDateTime = new Date();

  currentDateTime = `${currentDateTime.getFullYear()}-${
    currentDateTime.getMonth() + 1
  }-${currentDateTime.getDate()} ${currentDateTime.getHours()}:${currentDateTime.getMinutes()}:${currentDateTime.getSeconds()}`;

  const postQuery = `
    INSERT INTO tweet (tweet, user_id, date_time)
    VALUES ('${tweet}', ${userId}, '${currentDateTime}');
    `;

  await db.run(postQuery);
  response.send("Created a Tweet");
});

// API 11 - DELETE TWEET
app.delete("/tweets/:tweetId/", authentiateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;

  const selectQuery = `
    SELECT *
    FROM user
    WHERE username = '${username}';`;

  const dbUser = await db.get(selectQuery);
  const userId = dbUser.user_id;

  const userTweetIdsQuery = `
    SELECT tweet_id
    FROM tweet
    WHERE user_id = ${userId};`;

  const userTweetIds = await db.all(userTweetIdsQuery);
  const onlyTweetIds = userTweetIds.map((eachItem) => {
    return eachItem.tweet_id;
  });

  console.log(onlyTweetIds);

  if (onlyTweetIds.includes(parseInt(tweetId))) {
    const deleteQuery = `
        DELETE FROM tweet
        WHERE tweet_id = ${tweetId};`;

    await db.run(deleteQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

// TEST API FOR GETTING ALL USERS
app.get("/allusers/", async (request, response) => {
  const getQuery = `
    SELECT * 
    FROM user;`;

  let usersData = await db.all(getQuery);
  response.send(usersData);
});

module.exports = app;
