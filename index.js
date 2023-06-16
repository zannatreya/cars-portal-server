const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// const nodemailer = require('nodemailer');
// const mg = require('nodemailer-mailgun-transport');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ohyrzbo.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  // console.log('token', token);
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      // console.log(err)
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    const partCollection = client.db("carsPortal").collection("parts");
    const reviewCollection = client.db("carsPortal").collection("reviews");
    const userCollection = client.db("carsPortal").collection("users");
    const orderCollection = client.db("carsPortal").collection("orders");
    const paymentCollection = client.db("carsPortal").collection("payments");

    app.get("/part", async (req, res) => {
      const part = (await partCollection.find().toArray()).reverse();
      res.send(part);
    });

    app.get("/part/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const part = await partCollection.findOne(filter);
      res.send(part);
    });

    app.get("/order", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const query = { email };
      const order = (await orderCollection.find(query).toArray()).reverse();
      res.send(order);
    });
    app.get("/order/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const order = await orderCollection.findOne(filter);
      res.send(order);
    });

    app.get("/all-order", verifyJWT, async (req, res) => {
      const order = (await orderCollection.find().toArray()).reverse();
      res.send(order);
    });

    app.get("/review", async (req, res) => {
      const review = (await reviewCollection.find().toArray()).reverse();
      res.send(review);
    });

    app.get("/user", verifyJWT, async (req, res) => {
      const user = await userCollection.find().toArray();
      res.send(user);
    });

    app.get("/user/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const user = await userCollection.findOne(filter);
      res.send(user);
    });
    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await userCollection.findOne(query);
      // const isAdmin = user.role === "admin";
      res.send({ isAdmin: user?.role === "admin" });
    });
    app.get("/profile", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const filter = { email };
      // console.log(filter);
      const user = await userCollection.findOne(filter);
      res.send(user);
    });

    app.post("/user", verifyJWT, async (req, res) => {
      const user = req.body;
      console.log(user);
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.post("/part", verifyJWT, async (req, res) => {
      const part = req.body;
      const result = await partCollection.insertOne(part);
      res.send(result);
    });

    app.post("/review", verifyJWT, async (req, res) => {
      const review = req.body;
      const result = await reviewCollection.insertOne(review);
      res.send(result);
    });
    app.post("/order", verifyJWT, async (req, res) => {
      const order = req.body;
      const result = await orderCollection.insertOne(order);
      res.send(result);
    });

    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // put
    app.put("/user/:email", async (req, res) => {
      const filter = req.params;
      const user = req.body;
      const options = { upsert: true };
      const updateDoc = { $set: user };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      // const secretToken = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
      //   expiresIn: "6h",
      // });
      res.send({ result, secretToken });
    });
    app.put("/users/admin/:id", verifyJWT, async (req, res) => {
      // const decodedEmail = req.decoded.email;
      // const query = { email: decodedEmail };
      // const user = await userCollection.findOne(query);

      if (user?.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await userCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });

    // patch
    app.patch("/order/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const paymentInfo = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          transitionId: paymentInfo.transitionId,
        },
      };
      const result = await orderCollection.updateOne(filter, updateDoc);
      const payment = await paymentCollection.insertOne(paymentInfo);
      // sendPaymentConfirmationEmail(paymentInfo);
      res.send({ result, payment });
    });

    app.patch("/all-order/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const shipmentInfo = req.body;
      // console.log(shipmentInfo);
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          paid: true,
          shipped: shipmentInfo.shipped,
        },
      };
      const result = await orderCollection.updateOne(filter, updateDoc);
      // sendShipmentInfoEmail(shipmentInfo);
      res.send(result);
    });

    app.patch("/profile/:email", verifyJWT, async (req, res) => {
      const filter = req.params;
      const profile = req.body;
      const updateDoc = { $set: profile };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch("/user/admin/:email", verifyJWT, async (req, res) => {
      const filter = req.params;
      const updateDoc = {
        $set: { role: "admin" },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // delete
    app.delete("/order/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await orderCollection.deleteOne(query);
      res.send(result);
    });

    app.delete("/part/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await partCollection.deleteOne(query);
      res.send(result);
    });
  } finally {
  }
}
run().catch(console.log);

app.get("/", (req, res) => {
  res.send("Hello World from CARS PORTAL!");
});

app.listen(port, () => {
  console.log(`Cars portal is listening on port ${port}`);
});
